import Foundation
import UIKit
import Capacitor
import CryptoKit
import CommonCrypto
import Security
import Photos
import PhotosUI
import UniformTypeIdentifiers
import AVFoundation
import AVKit
import QuickLook
import ImageIO
import PDFKit
import LocalAuthentication

// =====================================================================
//  Planque — coffre chiffré local
//
//  Secret = suite de cachettes touchées dans la forêt (36 cachettes, 5 à 16 noisettes).
//
//  cachettes ──PBKDF2-SHA256 (600 000 tours, sel de l'appareil)──▶ pre (32 o)
//  pre ──SHA-256──▶ clé P-256 éphémère ──ECDH avec la clé de la PUCE DE SÉCURITÉ──▶ secret partagé
//  secret partagé ──HKDF-SHA256 (sel = pre)──▶ 64 octets
//     ├─ 32 premiers : clé d'enveloppe (KEK)
//     └─ 32 suivants : localisateur ─SHA-256─▶ nom du dossier du coffre
//  → chaque essai exige la puce de CET iPhone : impossible de tester des cachettes ailleurs.
//
//  Clé maîtresse aléatoire (256 bits) par coffre, enveloppée deux fois :
//     • par la KEK des cachettes (key.bin)
//     • par la phrase de récupération de 12 mots, 128 bits (rec.bin) → nouvel iPhone, cachettes oubliées
//  Fichiers : AES-256-GCM par blocs de 1 Mo, n° de bloc et « dernier bloc » authentifiés.
//  Index (noms, dates, tailles) et miniatures : chiffrés aussi.
//  Des cachettes inconnues ouvrent un coffre vide : jamais de message d'erreur.
// =====================================================================

// MARK: - Constantes

private enum K {
    static let spots = 36
    static let minNuts = 5
    static let maxNuts = 16
    static let iterations: UInt32 = 600_000
    static let chunk = 1 << 20
    static let magic: [UInt8] = Array("PLQ1".utf8)
    static let service = "com.hormend.planque"
    static let deviceKeyAccount = "device-key-v2"
    static let thumbMax: CGFloat = 420
    static let viewMax: CGFloat = 2560
}

// MARK: - Erreurs

enum VaultError: LocalizedError {
    case locked
    case notCreated
    case keyMissing
    case badPattern
    case notFound
    case corrupted
    case unavailable(String)
    case io(String)

    var errorDescription: String? {
        switch self {
        case .locked: return "Le coffre est verrouillé."
        case .notCreated: return "Ce coffre n’est pas encore créé."
        case .keyMissing: return "La clé de cet iPhone est introuvable."
        case .badPattern: return "Cache au moins 5 noisettes."
        case .notFound: return "Fichier introuvable."
        case .corrupted: return "Ce fichier est illisible."
        case .unavailable(let m): return m
        case .io(let m): return m
        }
    }

    var code: String {
        switch self {
        case .locked: return "LOCKED"
        case .notCreated: return "NOT_CREATED"
        case .keyMissing: return "KEY_MISSING"
        case .badPattern: return "BAD_PATTERN"
        case .notFound: return "NOT_FOUND"
        case .corrupted: return "CORRUPTED"
        case .unavailable: return "UNAVAILABLE"
        case .io: return "IO"
        }
    }
}

// MARK: - Chemins et utilitaires

private enum Paths {
    static var root: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("Planque", isDirectory: true)
    }
    static var vaults: URL { root.appendingPathComponent("vaults", isDirectory: true) }
    static var meta: URL { root.appendingPathComponent("meta.json") }
    /// Fichiers déchiffrés le temps d'un aperçu ou d'un partage : effacés au verrouillage.
    static var scratch: URL { FileManager.default.temporaryDirectory.appendingPathComponent("planque", isDirectory: true) }

    static func ensure(_ url: URL) throws {
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true,
                                                attributes: [.protectionKey: FileProtectionType.complete])
    }
}

private func randomBytes(_ n: Int) throws -> Data {
    var d = Data(count: n)
    let st = d.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, n, $0.baseAddress!) }
    guard st == errSecSuccess else { throw VaultError.io("Générateur aléatoire indisponible.") }
    return d
}

private func writeProtected(_ data: Data, to url: URL) throws {
    try data.write(to: url, options: [.atomic, .completeFileProtection])
}

private func fileSize(_ url: URL) throws -> Int {
    let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
    return (attrs[.size] as? NSNumber)?.intValue ?? 0
}

private extension Data {
    var hex: String { map { String(format: "%02x", $0) }.joined() }

    init?(hex: String) {
        guard hex.count % 2 == 0 else { return nil }
        var d = Data(capacity: hex.count / 2)
        var i = hex.startIndex
        while i < hex.endIndex {
            let j = hex.index(i, offsetBy: 2)
            guard let b = UInt8(hex[i..<j], radix: 16) else { return nil }
            d.append(b)
            i = j
        }
        self = d
    }
}

// MARK: - Clé de l'appareil (puce de sécurité)
//
//  Clé P-256 créée DANS la Secure Enclave : elle ne peut jamais en sortir, ni être sauvegardée,
//  ni être copiée sur un autre appareil. Le trousseau ne garde qu'une référence chiffrée
//  utilisable uniquement par la puce de cet iPhone.

private enum DeviceKey {
    case enclave(SecureEnclave.P256.KeyAgreement.PrivateKey)
    case software(P256.KeyAgreement.PrivateKey) // Simulateur uniquement (pas de puce)

    var publicKey: P256.KeyAgreement.PublicKey {
        switch self {
        case .enclave(let k): return k.publicKey
        case .software(let k): return k.publicKey
        }
    }

    func agree(with pub: P256.KeyAgreement.PublicKey) throws -> SharedSecret {
        switch self {
        case .enclave(let k): return try k.sharedSecretFromKeyAgreement(with: pub)
        case .software(let k): return try k.sharedSecretFromKeyAgreement(with: pub)
        }
    }

    var fingerprint: String { Data(SHA256.hash(data: publicKey.rawRepresentation)).prefix(8).hex }

    static func query() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: K.service,
         kSecAttrAccount as String: K.deviceKeyAccount]
    }

    static func load() -> DeviceKey? {
        var q = query()
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let d = out as? Data, d.count > 1 else { return nil }
        let body = Data(d.dropFirst())
        switch d[d.startIndex] {
        case 1: return (try? SecureEnclave.P256.KeyAgreement.PrivateKey(dataRepresentation: body)).map { .enclave($0) }
        case 2: return (try? P256.KeyAgreement.PrivateKey(rawRepresentation: body)).map { .software($0) }
        default: return nil
        }
    }

    static func create() throws -> DeviceKey {
        SecItemDelete(query() as CFDictionary)
        let key: DeviceKey
        var blob: Data
        if SecureEnclave.isAvailable {
            guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
                                                               .privateKeyUsage, nil) else {
                throw VaultError.io("Puce de sécurité indisponible.")
            }
            let k = try SecureEnclave.P256.KeyAgreement.PrivateKey(accessControl: access)
            key = .enclave(k)
            blob = Data([1])
            blob.append(k.dataRepresentation)
        } else {
            let k = P256.KeyAgreement.PrivateKey()
            key = .software(k)
            blob = Data([2])
            blob.append(k.rawRepresentation)
        }
        var q = query()
        q[kSecValueData as String] = blob
        q[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let st = SecItemAdd(q as CFDictionary, nil)
        guard st == errSecSuccess else { throw VaultError.io("Trousseau indisponible (\(st)).") }
        return key
    }
}

private struct Meta: Codable {
    var v: Int
    var salt: String
    var device: String
}

private func readMeta() -> Meta? {
    (try? Data(contentsOf: Paths.meta)).flatMap { try? JSONDecoder().decode(Meta.self, from: $0) }
}

private func writeMeta(_ m: Meta) throws {
    try Paths.ensure(Paths.root)
    try writeProtected(try JSONEncoder().encode(m), to: Paths.meta)
}

// MARK: - Dérivation de clé

private struct Derived {
    let kek: SymmetricKey
    let vaultId: String
}

private func derive(_ nuts: [Int], salt: Data, device: DeviceKey) throws -> Derived {
    let password = "plq2|foret36|" + nuts.map(String.init).joined(separator: "-")
    let pwLen = password.utf8.count
    var pre = [UInt8](repeating: 0, count: 32)
    let rc = salt.withUnsafeBytes { (s: UnsafeRawBufferPointer) -> Int32 in
        CCKeyDerivationPBKDF(CCPBKDFAlgorithm(kCCPBKDF2),
                             password, pwLen,
                             s.bindMemory(to: UInt8.self).baseAddress, s.count,
                             CCPseudoRandomAlgorithm(kCCPRFHmacAlgSHA256),
                             K.iterations,
                             &pre, pre.count)
    }
    defer { for i in pre.indices { pre[i] = 0 } }
    guard rc == Int32(kCCSuccess) else { throw VaultError.io("Dérivation de clé impossible.") }
    let preData = Data(pre)

    // Clé éphémère tirée de l'essai, puis accord ECDH avec la clé de la puce :
    // chaque essai doit passer par la Secure Enclave de cet iPhone.
    var seed = Data(SHA256.hash(data: Data("plq-se|".utf8) + preData))
    var ephemeral: P256.KeyAgreement.PrivateKey?
    for _ in 0..<16 {
        if let k = try? P256.KeyAgreement.PrivateKey(rawRepresentation: seed) { ephemeral = k; break }
        seed = Data(SHA256.hash(data: seed))
    }
    guard let eph = ephemeral else { throw VaultError.io("Dérivation de clé impossible.") }
    let shared = try device.agree(with: eph.publicKey)
    let okm = shared.hkdfDerivedSymmetricKey(using: SHA256.self, salt: preData,
                                             sharedInfo: Data("plq2-keys".utf8), outputByteCount: 64)
    let bytes = okm.withUnsafeBytes { Data($0) }
    return Derived(kek: SymmetricKey(data: bytes.prefix(32)),
                   vaultId: Data(SHA256.hash(data: bytes.suffix(32))).prefix(16).hex)
}

// MARK: - Phrase de récupération (128 bits, indépendante de l'appareil)

private struct RecoveryKeys {
    let kek: SymmetricKey
    let rid: String
}

private func recoveryKeys(_ entropy: Data) -> RecoveryKeys {
    let okm = HKDF<SHA256>.deriveKey(inputKeyMaterial: SymmetricKey(data: entropy),
                                     salt: Data("plq-recovery".utf8),
                                     info: Data("plq2-rec".utf8), outputByteCount: 64)
    let b = okm.withUnsafeBytes { Data($0) }
    return RecoveryKeys(kek: SymmetricKey(data: b.prefix(32)),
                        rid: Data(SHA256.hash(data: b.suffix(32))).prefix(16).hex)
}

// MARK: - Chiffrement des petits blocs (clé enveloppée, index)

private enum Small {
    static func seal(_ d: Data, key: SymmetricKey, aad: String) throws -> Data {
        guard let c = try AES.GCM.seal(d, using: key, authenticating: Data(aad.utf8)).combined else {
            throw VaultError.corrupted
        }
        return c
    }

    static func open(_ d: Data, key: SymmetricKey, aad: String) throws -> Data {
        try AES.GCM.open(try AES.GCM.SealedBox(combined: d), using: key, authenticating: Data(aad.utf8))
    }
}

// MARK: - Chiffrement des fichiers par blocs

private enum Blob {
    static func aad(_ id: String, _ index: UInt64, last: Bool) -> Data {
        var d = Data("plq-blob|\(id)|".utf8)
        withUnsafeBytes(of: index.bigEndian) { d.append(contentsOf: $0) }
        d.append(last ? 1 : 0)
        return d
    }

    static func seal(id: String, total: Int, key: SymmetricKey, to dst: URL,
                     read: (Int, Int) throws -> Data) throws {
        guard FileManager.default.createFile(atPath: dst.path, contents: nil,
                                             attributes: [.protectionKey: FileProtectionType.complete]) else {
            throw VaultError.io("Écriture impossible.")
        }
        do {
            let h = try FileHandle(forWritingTo: dst)
            defer { try? h.close() }
            var header = Data(K.magic)
            withUnsafeBytes(of: UInt32(K.chunk).bigEndian) { header.append(contentsOf: $0) }
            try h.write(contentsOf: header)
            var offset = 0
            var index: UInt64 = 0
            repeat {
                let len = min(K.chunk, total - offset)
                try autoreleasepool {
                    let plain = try read(offset, len)
                    guard plain.count == len else { throw VaultError.io("Lecture incomplète.") }
                    let last = offset + len >= total
                    let box = try AES.GCM.seal(plain, using: key, authenticating: aad(id, index, last: last))
                    guard let combined = box.combined else { throw VaultError.corrupted }
                    try h.write(contentsOf: combined)
                }
                offset += len
                index += 1
            } while offset < total
        } catch {
            try? FileManager.default.removeItem(at: dst)
            throw error
        }
    }

    static func seal(file src: URL, id: String, key: SymmetricKey, to dst: URL) throws {
        let total = try fileSize(src)
        let h = try FileHandle(forReadingFrom: src)
        defer { try? h.close() }
        try seal(id: id, total: total, key: key, to: dst) { offset, len in
            try h.seek(toOffset: UInt64(offset))
            return try h.read(upToCount: len) ?? Data()
        }
    }

    static func seal(data: Data, id: String, key: SymmetricKey, to dst: URL) throws {
        let start = data.startIndex
        try seal(id: id, total: data.count, key: key, to: dst) { offset, len in
            data.subdata(in: (start + offset)..<(start + offset + len))
        }
    }

    static func open(_ src: URL, id: String, key: SymmetricKey, sink: (Data) throws -> Void) throws {
        let total = try fileSize(src)
        let h = try FileHandle(forReadingFrom: src)
        defer { try? h.close() }
        guard let head = try h.read(upToCount: 8), head.count == 8 else { throw VaultError.corrupted }
        let b = [UInt8](head)
        guard Array(b[0..<4]) == K.magic else { throw VaultError.corrupted }
        let chunk = Int(b[4]) << 24 | Int(b[5]) << 16 | Int(b[6]) << 8 | Int(b[7])
        guard chunk > 0, chunk <= 16 << 20 else { throw VaultError.corrupted }
        let record = chunk + 28 // nonce 12 + tag 16
        var pos = 8
        var index: UInt64 = 0
        while pos < total {
            let n = min(record, total - pos)
            try autoreleasepool {
                guard let c = try h.read(upToCount: n), c.count == n else { throw VaultError.corrupted }
                pos += n
                let box = try AES.GCM.SealedBox(combined: c)
                let plain = try AES.GCM.open(box, using: key, authenticating: aad(id, index, last: pos >= total))
                try sink(plain)
            }
            index += 1
        }
        guard index > 0 else { throw VaultError.corrupted }
    }

    static func openData(_ src: URL, id: String, key: SymmetricKey) throws -> Data {
        var out = Data()
        try Blob.open(src, id: id, key: key) { out.append($0) }
        return out
    }

    static func openFile(_ src: URL, id: String, key: SymmetricKey, to dst: URL) throws {
        guard FileManager.default.createFile(atPath: dst.path, contents: nil,
                                             attributes: [.protectionKey: FileProtectionType.complete]) else {
            throw VaultError.io("Écriture impossible.")
        }
        let h = try FileHandle(forWritingTo: dst)
        defer { try? h.close() }
        try Blob.open(src, id: id, key: key) { try h.write(contentsOf: $0) }
    }
}

// MARK: - Modèle du coffre

struct VaultItem: Codable {
    var id: String
    var kind: String          // photo | video | file
    var name: String
    var ext: String
    var size: Int
    var added: Double
    var width: Int?
    var height: Int?
    var duration: Double?
    var hasThumb: Bool = false

    var js: JSObject {
        var o: JSObject = ["id": id, "kind": kind, "name": name, "ext": ext,
                           "size": size, "added": added, "hasThumb": hasThumb]
        if let width { o["width"] = width }
        if let height { o["height"] = height }
        if let duration { o["duration"] = duration }
        return o
    }
}

struct VaultIndex: Codable {
    var v = 1
    var items: [VaultItem] = []
    var settings: [String: String] = [:]
}

private final class VaultSession {
    let vaultId: String
    let kek: SymmetricKey
    let master: SymmetricKey
    var persisted: Bool
    var index: VaultIndex

    init(vaultId: String, kek: SymmetricKey, master: SymmetricKey, persisted: Bool, index: VaultIndex) {
        self.vaultId = vaultId
        self.kek = kek
        self.master = master
        self.persisted = persisted
        self.index = index
    }

    var dir: URL { Paths.vaults.appendingPathComponent(vaultId, isDirectory: true) }
    var blobs: URL { dir.appendingPathComponent("b", isDirectory: true) }
    var thumbs: URL { dir.appendingPathComponent("t", isDirectory: true) }
    var keyFile: URL { dir.appendingPathComponent("key.bin") }
    var indexFile: URL { dir.appendingPathComponent("index.bin") }

    func item(_ id: String) -> VaultItem? { index.items.first { $0.id == id } }

    func saveIndex() throws {
        guard persisted else { return }
        let json = try JSONEncoder().encode(index)
        try writeProtected(try Small.seal(json, key: master, aad: "plq-index"), to: indexFile)
    }

    var recFile: URL { dir.appendingPathComponent("rec.bin") }
    var ridFile: URL { dir.appendingPathComponent("rid") }

    /// Crée le coffre sur le disque. Renvoie l'entropie de la phrase de récupération (montrée une seule fois).
    func persist() throws -> Data {
        guard !FileManager.default.fileExists(atPath: dir.path) else { throw VaultError.io("Ce coffre existe déjà.") }
        try Paths.ensure(blobs)
        try Paths.ensure(thumbs)
        let raw = master.withUnsafeBytes { Data($0) }
        try writeProtected(try Small.seal(raw, key: kek, aad: "plq-key|\(vaultId)"), to: keyFile)
        persisted = true
        try saveIndex()
        return try writeRecovery()
    }

    /// (Re)génère la phrase de récupération de ce coffre.
    func writeRecovery() throws -> Data {
        let entropy = try randomBytes(16)
        let rk = recoveryKeys(entropy)
        let raw = master.withUnsafeBytes { Data($0) }
        try writeProtected(try Small.seal(raw, key: rk.kek, aad: "plq-rec"), to: recFile)
        try writeProtected(Data(rk.rid.utf8), to: ridFile)
        return entropy
    }

    /// Ouvre le coffre lié au schéma, ou prépare un coffre vide (non écrit) s'il n'existe pas.
    static func open(_ d: Derived) -> VaultSession {
        let probe = VaultSession(vaultId: d.vaultId, kek: d.kek, master: SymmetricKey(size: .bits256),
                                 persisted: false, index: VaultIndex())
        guard let wrapped = try? Data(contentsOf: probe.keyFile),
              let raw = try? Small.open(wrapped, key: d.kek, aad: "plq-key|\(d.vaultId)") else {
            return probe
        }
        let master = SymmetricKey(data: raw)
        var index = VaultIndex()
        if let enc = try? Data(contentsOf: probe.indexFile),
           let json = try? Small.open(enc, key: master, aad: "plq-index"),
           let decoded = try? JSONDecoder().decode(VaultIndex.self, from: json) {
            index = decoded
        }
        return VaultSession(vaultId: d.vaultId, kek: d.kek, master: master, persisted: true, index: index)
    }
}

// MARK: - Médias (dimensions, miniatures, affichage)

private enum Source {
    case file(URL)
    case data(Data)
}

private struct MediaInfo {
    var width: Int?
    var height: Int?
    var duration: Double?
    var thumb: Data?
}

private enum Media {
    static func inspect(_ src: Source, kind: String) -> MediaInfo {
        switch kind {
        case "photo":
            return image(src)
        case "video":
            if case .file(let url) = src { return video(url) }
            return MediaInfo()
        default:
            if case .file(let url) = src { return document(url) }
            return MediaInfo()
        }
    }

    static func imageSource(_ src: Source) -> CGImageSource? {
        switch src {
        case .file(let u): return CGImageSourceCreateWithURL(u as CFURL, nil)
        case .data(let d): return CGImageSourceCreateWithData(d as CFData, nil)
        }
    }

    static func scaled(_ isrc: CGImageSource, max: CGFloat, quality: CGFloat) -> Data? {
        let opts: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: max,
            kCGImageSourceShouldCacheImmediately: true
        ]
        guard let cg = CGImageSourceCreateThumbnailAtIndex(isrc, 0, opts as CFDictionary) else { return nil }
        return UIImage(cgImage: cg).jpegData(compressionQuality: quality)
    }

    static func image(_ src: Source) -> MediaInfo {
        var info = MediaInfo()
        guard let isrc = imageSource(src) else { return info }
        if let props = CGImageSourceCopyPropertiesAtIndex(isrc, 0, nil) as? [CFString: Any] {
            let w = props[kCGImagePropertyPixelWidth] as? Int
            let h = props[kCGImagePropertyPixelHeight] as? Int
            let o = props[kCGImagePropertyOrientation] as? Int ?? 1
            if o >= 5 { info.width = h; info.height = w } else { info.width = w; info.height = h }
        }
        info.thumb = scaled(isrc, max: K.thumbMax, quality: 0.8)
        return info
    }

    static func video(_ url: URL) -> MediaInfo {
        var info = MediaInfo()
        let asset = AVURLAsset(url: url)
        let seconds = CMTimeGetSeconds(asset.duration)
        if seconds.isFinite { info.duration = seconds }
        if let track = asset.tracks(withMediaType: .video).first {
            let size = track.naturalSize.applying(track.preferredTransform)
            info.width = Int(abs(size.width))
            info.height = Int(abs(size.height))
        }
        let gen = AVAssetImageGenerator(asset: asset)
        gen.appliesPreferredTrackTransform = true
        gen.maximumSize = CGSize(width: K.thumbMax, height: K.thumbMax)
        let at = CMTime(seconds: min(0.5, (info.duration ?? 0) / 2), preferredTimescale: 600)
        if let cg = try? gen.copyCGImage(at: at, actualTime: nil) {
            info.thumb = UIImage(cgImage: cg).jpegData(compressionQuality: 0.8)
        }
        return info
    }

    /// Miniature de document : seulement pour les PDF, rendus dans l'appli (aucun service système).
    static func document(_ url: URL) -> MediaInfo {
        var info = MediaInfo()
        if url.pathExtension.lowercased() == "pdf", let doc = PDFDocument(url: url), let page = doc.page(at: 0) {
            info.thumb = page.thumbnail(of: CGSize(width: 360, height: 360), for: .mediaBox)
                .jpegData(compressionQuality: 0.8)
        }
        return info
    }

    static func displayJPEG(_ data: Data) throws -> Data {
        guard let isrc = CGImageSourceCreateWithData(data as CFData, nil),
              let jpeg = scaled(isrc, max: K.viewMax, quality: 0.9) else { throw VaultError.corrupted }
        return jpeg
    }
}

// MARK: - Contrôleurs natifs (sélecteurs, lecteur, aperçu)

private final class PhotoPickerDelegate: NSObject, PHPickerViewControllerDelegate {
    let done: ([PHPickerResult]) -> Void
    init(_ done: @escaping ([PHPickerResult]) -> Void) { self.done = done }
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        done(results)
    }
}

private final class CameraDelegate: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    let done: ([UIImagePickerController.InfoKey: Any]?) -> Void
    init(_ done: @escaping ([UIImagePickerController.InfoKey: Any]?) -> Void) { self.done = done }
    func imagePickerController(_ picker: UIImagePickerController,
                               didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        picker.dismiss(animated: true)
        done(info)
    }
    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true)
        done(nil)
    }
}

private final class DocPickerDelegate: NSObject, UIDocumentPickerDelegate {
    let done: ([URL]) -> Void
    init(_ done: @escaping ([URL]) -> Void) { self.done = done }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { done(urls) }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { done([]) }
}

/// Lecteur vidéo plein écran ; le fichier déchiffré est effacé dès la fermeture.
private final class PlayerHost: UIViewController {
    let url: URL
    var onClose: (() -> Void)?
    private let playerVC = AVPlayerViewController()

    init(url: URL) {
        self.url = url
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }
    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        playerVC.player = AVPlayer(url: url)
        addChild(playerVC)
        playerVC.view.frame = view.bounds
        playerVC.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.addSubview(playerVC.view)
        playerVC.didMove(toParent: self)

        let close = UIButton(type: .system)
        close.setImage(UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)), for: .normal)
        close.tintColor = .white
        close.backgroundColor = UIColor(white: 0.15, alpha: 0.8)
        close.layer.cornerRadius = 20
        close.translatesAutoresizingMaskIntoConstraints = false
        close.accessibilityLabel = "Fermer"
        close.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        view.addSubview(close)
        NSLayoutConstraint.activate([
            close.widthAnchor.constraint(equalToConstant: 40),
            close.heightAnchor.constraint(equalToConstant: 40),
            close.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8)
        ])
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        playerVC.player?.play()
    }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        playerVC.player?.pause()
        playerVC.player = nil
        onClose?()
        onClose = nil
    }

    @objc private func closeTapped() { dismiss(animated: true) }
}

private final class PreviewSource: NSObject, QLPreviewControllerDataSource, QLPreviewControllerDelegate {
    let url: URL
    let onClose: () -> Void
    init(url: URL, onClose: @escaping () -> Void) { self.url = url; self.onClose = onClose }
    func numberOfPreviewItems(in controller: QLPreviewController) -> Int { 1 }
    func previewController(_ controller: QLPreviewController, previewItemAt index: Int) -> QLPreviewItem { url as NSURL }
    func previewController(_ controller: QLPreviewController, editingModeFor previewItem: QLPreviewItem) -> QLPreviewItemEditingMode { .disabled }
    func previewControllerDidDismiss(_ controller: QLPreviewController) { onClose() }
}

// MARK: - Plugin

@objc(VaultPlugin)
public class VaultPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "VaultPlugin"
    public let jsName = "Vault"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unlock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "confirmNew", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "lock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "uncover", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "thumbs", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "photo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openItem", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "importPhotos", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "importCamera", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "importFiles", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteOriginals", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setSetting", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "destroy", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recoverStart", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "recoverFinish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "newRecovery", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "biometry", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise)
    ]

    /// Toute la cryptographie et l'état du coffre passent par cette file série.
    private let q = DispatchQueue(label: "com.hormend.planque.vault", qos: .userInitiated)
    private var session: VaultSession?          // file q uniquement
    private var lastAssetIds: [String] = []     // file q uniquement
    private var pendingRecovery: (dir: URL, master: SymmetricKey)? // file q uniquement

    // Fil principal uniquement
    private var cover: UIView?
    private var waitingForJS = false
    private var uiCalls: [String: CAPPluginCall] = [:]
    private var photoDelegate: PhotoPickerDelegate?
    private var cameraDelegate: CameraDelegate?
    private var docDelegate: DocPickerDelegate?
    private var previewSource: PreviewSource?

    override public func load() {
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(appWillResign), name: UIApplication.willResignActiveNotification, object: nil)
        nc.addObserver(self, selector: #selector(appDidEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        nc.addObserver(self, selector: #selector(appDidBecomeActive), name: UIApplication.didBecomeActiveNotification, object: nil)
        nc.addObserver(self, selector: #selector(captureChanged), name: UIScreen.capturedDidChangeNotification, object: nil)
        q.async { try? FileManager.default.removeItem(at: Paths.scratch) }
    }

    // MARK: Aides

    private func run(_ call: CAPPluginCall, _ work: @escaping () throws -> JSObject) {
        q.async {
            do { call.resolve(try work()) } catch { self.fail(call, error) }
        }
    }

    private func fail(_ call: CAPPluginCall, _ error: Error) {
        let run = {
            self.uiCalls.removeValue(forKey: call.callbackId)
            if let e = error as? VaultError {
                call.reject(e.localizedDescription, e.code)
            } else {
                call.reject("Opération impossible.", "FAILED", error)
            }
        }
        if Thread.isMainThread { run() } else { DispatchQueue.main.async(execute: run) }
    }

    private func beginUI(_ call: CAPPluginCall) { uiCalls[call.callbackId] = call }

    private func endUI(_ call: CAPPluginCall, _ data: JSObject) {
        let run = {
            guard self.uiCalls.removeValue(forKey: call.callbackId) != nil else { return }
            call.resolve(data)
        }
        if Thread.isMainThread { run() } else { DispatchQueue.main.async(execute: run) }
    }

    private func requireSession() throws -> VaultSession {
        guard let s = session else { throw VaultError.locked }
        return s
    }

    private func requirePersisted() throws -> VaultSession {
        let s = try requireSession()
        guard s.persisted else { throw VaultError.notCreated }
        return s
    }

    private func nuts(_ call: CAPPluginCall) throws -> [Int] {
        let raw = call.getArray("nuts") ?? []
        let pts = raw.compactMap { v -> Int? in
            if let n = v as? NSNumber { return n.intValue }
            if let i = v as? Int { return i }
            return nil
        }
        let spots = 0..<K.spots
        guard pts.count >= K.minNuts, pts.count <= K.maxNuts, pts.count == raw.count,
              pts.allSatisfy({ spots.contains($0) }) else {
            throw VaultError.badPattern
        }
        return pts
    }

    private func ids(_ call: CAPPluginCall) -> [String] {
        (call.getArray("ids") ?? []).compactMap { $0 as? String }
    }

    /// Clé de la puce + sel de l'appareil.
    /// - create : premier lancement, on peut créer la clé.
    /// - reset : récupération sur un nouvel iPhone, on remplace une clé absente ou différente.
    private func deviceContext(create: Bool, reset: Bool = false) throws -> (DeviceKey, Data) {
        let meta = readMeta()
        if !reset, let key = DeviceKey.load() {
            if let m = meta {
                guard m.device == key.fingerprint, let salt = Data(hex: m.salt) else { throw VaultError.keyMissing }
                return (key, salt)
            }
            let salt = try randomBytes(16)
            try writeMeta(Meta(v: 2, salt: salt.hex, device: key.fingerprint))
            return (key, salt)
        }
        if meta != nil && !reset { throw VaultError.keyMissing }
        guard create || reset else { throw VaultError.keyMissing }
        let key = try DeviceKey.create()
        let salt: Data
        if let m = meta, let old = Data(hex: m.salt) { salt = old } else { salt = try randomBytes(16) }
        try writeMeta(Meta(v: 2, salt: salt.hex, device: key.fingerprint))
        return (key, salt)
    }

    private func snapshot(_ s: VaultSession) -> JSObject {
        var settings = JSObject()
        for (k, v) in s.index.settings { settings[k] = v }
        return ["items": s.index.items.map { $0.js } as JSArray,
                "isNew": !s.persisted,
                "settings": settings]
    }

    /// Appelée sur la file q.
    private func wipeSession() {
        session = nil
        lastAssetIds = []
        pendingRecovery = nil
        try? FileManager.default.removeItem(at: Paths.scratch)
    }

    private func fileName(_ item: VaultItem) -> String {
        var base = item.name.replacingOccurrences(of: "/", with: "-").replacingOccurrences(of: ":", with: "-")
        if base.isEmpty { base = "Fichier" }
        var ext = item.ext
        if ext.isEmpty { ext = item.kind == "video" ? "mov" : (item.kind == "photo" ? "jpg" : "bin") }
        return "\(base).\(ext)"
    }

    /// Appelée sur la file q. Chiffre une source et l'ajoute à l'index du coffre ouvert.
    private func ingest(_ src: Source, kind: String, name: String, ext: String, vaultId: String) throws -> VaultItem {
        guard let s = session, s.vaultId == vaultId, s.persisted else { throw VaultError.locked }
        let id = UUID().uuidString.lowercased()
        var item = VaultItem(id: id, kind: kind, name: name, ext: ext.lowercased(), size: 0,
                             added: Date().timeIntervalSince1970 * 1000)
        let blob = s.blobs.appendingPathComponent(id)
        switch src {
        case .file(let url):
            item.size = try fileSize(url)
            try Blob.seal(file: url, id: id, key: s.master, to: blob)
        case .data(let d):
            item.size = d.count
            try Blob.seal(data: d, id: id, key: s.master, to: blob)
        }
        let info = Media.inspect(src, kind: kind)
        item.width = info.width
        item.height = info.height
        item.duration = info.duration
        if let thumb = info.thumb {
            try Blob.seal(data: thumb, id: id + ".t", key: s.master, to: s.thumbs.appendingPathComponent(id))
            item.hasThumb = true
        }
        s.index.items.insert(item, at: 0)
        try s.saveIndex()
        return item
    }

    // MARK: État et ouverture

    @objc func status(_ call: CAPPluginCall) {
        run(call) {
            let enclave = SecureEnclave.isAvailable
            do {
                _ = try self.deviceContext(create: false)
                return ["ready": true, "problem": NSNull(), "enclave": enclave]
            } catch VaultError.keyMissing {
                let hasMeta = FileManager.default.fileExists(atPath: Paths.meta.path)
                if hasMeta { return ["ready": false, "problem": "keyMissing", "enclave": enclave] }
                return ["ready": true, "problem": NSNull(), "enclave": enclave]
            }
        }
    }

    @objc func unlock(_ call: CAPPluginCall) {
        let secret: [Int]
        do { secret = try nuts(call) } catch { fail(call, error); return }
        run(call) {
            self.wipeSession()
            let (device, salt) = try self.deviceContext(create: true)
            let s = VaultSession.open(try derive(secret, salt: salt, device: device))
            self.session = s
            return self.snapshot(s)
        }
    }

    /// Crée réellement le coffre vide ouvert, après une deuxième saisie des mêmes cachettes.
    /// Renvoie l'entropie de la phrase de récupération, à montrer une seule fois.
    @objc func confirmNew(_ call: CAPPluginCall) {
        let secret: [Int]
        do { secret = try nuts(call) } catch { call.resolve(["ok": false]); return }
        run(call) {
            let s = try self.requireSession()
            if s.persisted { return ["ok": true] }
            let (device, salt) = try self.deviceContext(create: false)
            let d = try derive(secret, salt: salt, device: device)
            guard d.vaultId == s.vaultId else { return ["ok": false] }
            let entropy = try s.persist()
            return ["ok": true, "recovery": entropy.hex]
        }
    }

    // MARK: Récupération

    /// Cherche le coffre de cet iPhone qui correspond à la phrase (entropie en hexadécimal).
    @objc func recoverStart(_ call: CAPPluginCall) {
        guard let hex = call.getString("entropy"), let entropy = Data(hex: hex), entropy.count == 16 else {
            call.resolve(["found": false])
            return
        }
        run(call) {
            self.wipeSession()
            let rk = recoveryKeys(entropy)
            let dirs = (try? FileManager.default.contentsOfDirectory(at: Paths.vaults, includingPropertiesForKeys: nil)) ?? []
            for dir in dirs {
                guard let rid = try? Data(contentsOf: dir.appendingPathComponent("rid")),
                      String(decoding: rid, as: UTF8.self) == rk.rid,
                      let enc = try? Data(contentsOf: dir.appendingPathComponent("rec.bin")),
                      let raw = try? Small.open(enc, key: rk.kek, aad: "plq-rec") else { continue }
                self.pendingRecovery = (dir, SymmetricKey(data: raw))
                return ["found": true]
            }
            return ["found": false]
        }
    }

    /// Associe de nouvelles cachettes au coffre retrouvé (et une nouvelle clé de puce sur un nouvel iPhone).
    @objc func recoverFinish(_ call: CAPPluginCall) {
        let secret: [Int]
        do { secret = try nuts(call) } catch { fail(call, error); return }
        run(call) {
            guard let pending = self.pendingRecovery else { throw VaultError.locked }
            let keyOK = (try? self.deviceContext(create: false)) != nil
            let (device, salt) = try self.deviceContext(create: true, reset: !keyOK)
            let d = try derive(secret, salt: salt, device: device)
            let fm = FileManager.default
            let target = Paths.vaults.appendingPathComponent(d.vaultId, isDirectory: true)
            let same = target.standardizedFileURL.path == pending.dir.standardizedFileURL.path
            if !same && fm.fileExists(atPath: target.path) {
                throw VaultError.io("Ces cachettes ouvrent déjà un autre coffre. Choisis-en d’autres.")
            }
            let raw = pending.master.withUnsafeBytes { Data($0) }
            try writeProtected(try Small.seal(raw, key: d.kek, aad: "plq-key|\(d.vaultId)"),
                               to: pending.dir.appendingPathComponent("key.bin"))
            if !same { try fm.moveItem(at: pending.dir, to: target) }
            self.pendingRecovery = nil
            let s = VaultSession.open(d)
            guard s.persisted else { throw VaultError.corrupted }
            self.session = s
            return self.snapshot(s)
        }
    }

    /// Remplace la phrase de récupération du coffre ouvert (l'ancienne ne marche plus).
    @objc func newRecovery(_ call: CAPPluginCall) {
        run(call) {
            let s = try self.requirePersisted()
            return ["recovery": try s.writeRecovery().hex]
        }
    }

    // MARK: Face ID (verrou d'accès optionnel, en plus des cachettes)

    @objc func biometry(_ call: CAPPluginCall) {
        let ctx = LAContext()
        var err: NSError?
        let ok = ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err)
        let kind: String
        switch ctx.biometryType {
        case .faceID: kind = "faceID"
        case .touchID: kind = "touchID"
        default: kind = "none"
        }
        call.resolve(["available": ok, "type": kind])
    }

    @objc func authenticate(_ call: CAPPluginCall) {
        let ctx = LAContext()
        ctx.localizedCancelTitle = "Annuler"
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else {
            call.resolve(["ok": true, "available": false])
            return
        }
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: "Ouvrir Planque") { ok, _ in
            call.resolve(["ok": ok, "available": true])
        }
    }

    @objc func lock(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.dismissEverything()
            self.q.async {
                self.wipeSession()
                call.resolve()
            }
        }
    }

    /// L'interface a affiché l'écran de verrouillage : on peut retirer le cache.
    @objc func uncover(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.waitingForJS = false
            if UIApplication.shared.applicationState == .active && !self.isCaptured { self.hideCover() }
            call.resolve()
        }
    }

    // MARK: Lecture

    @objc func thumbs(_ call: CAPPluginCall) {
        let wanted = ids(call)
        run(call) {
            let s = try self.requireSession()
            let known = Dictionary(uniqueKeysWithValues: s.index.items.map { ($0.id, $0) })
            var out = JSObject()
            for id in wanted {
                guard known[id]?.hasThumb == true else { continue }
                if let d = try? Blob.openData(s.thumbs.appendingPathComponent(id), id: id + ".t", key: s.master) {
                    out[id] = "data:image/jpeg;base64," + d.base64EncodedString()
                }
            }
            return ["thumbs": out]
        }
    }

    @objc func photo(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { fail(call, VaultError.notFound); return }
        run(call) {
            let s = try self.requireSession()
            guard s.item(id) != nil else { throw VaultError.notFound }
            let data = try Blob.openData(s.blobs.appendingPathComponent(id), id: id, key: s.master)
            let jpeg = try Media.displayJPEG(data)
            return ["src": "data:image/jpeg;base64," + jpeg.base64EncodedString()]
        }
    }

    /// Vidéos et documents : déchiffrés dans un dossier temporaire, effacé à la fermeture.
    @objc func openItem(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else { fail(call, VaultError.notFound); return }
        q.async {
            do {
                let s = try self.requireSession()
                guard let item = s.item(id) else { throw VaultError.notFound }
                let dir = Paths.scratch.appendingPathComponent(UUID().uuidString, isDirectory: true)
                try Paths.ensure(dir)
                let url = dir.appendingPathComponent(self.fileName(item))
                try Blob.openFile(s.blobs.appendingPathComponent(id), id: id, key: s.master, to: url)
                DispatchQueue.main.async { self.presentViewer(item: item, url: url, dir: dir, call: call) }
            } catch {
                self.fail(call, error)
            }
        }
    }

    private func presentViewer(item: VaultItem, url: URL, dir: URL, call: CAPPluginCall) {
        guard let vc = bridge?.viewController else { fail(call, VaultError.unavailable("Affichage impossible.")); return }
        let done: () -> Void = { [weak self] in
            self?.q.async { try? FileManager.default.removeItem(at: dir) }
            self?.previewSource = nil
            self?.endUI(call, [:])
        }
        beginUI(call)
        if item.kind == "video" {
            let host = PlayerHost(url: url)
            host.onClose = done
            vc.present(host, animated: true)
        } else {
            let source = PreviewSource(url: url, onClose: done)
            previewSource = source
            let ql = QLPreviewController()
            ql.dataSource = source
            ql.delegate = source
            vc.present(ql, animated: true)
        }
    }

    // MARK: Import

    private func withPersistedVault(_ call: CAPPluginCall, _ then: @escaping (String) -> Void) {
        q.async {
            do {
                let s = try self.requirePersisted()
                let vaultId = s.vaultId
                DispatchQueue.main.async { then(vaultId) }
            } catch {
                self.fail(call, error)
            }
        }
    }

    @objc func importPhotos(_ call: CAPPluginCall) {
        withPersistedVault(call) { vaultId in
            var cfg = PHPickerConfiguration(photoLibrary: .shared())
            cfg.selectionLimit = 0
            cfg.selection = .ordered
            cfg.filter = .any(of: [.images, .videos])
            cfg.preferredAssetRepresentationMode = .current
            let picker = PHPickerViewController(configuration: cfg)
            let delegate = PhotoPickerDelegate { [weak self] results in
                self?.photoDelegate = nil
                self?.ingestPicked(results, vaultId: vaultId, call: call)
            }
            self.photoDelegate = delegate
            picker.delegate = delegate
            self.beginUI(call)
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    private func ingestPicked(_ results: [PHPickerResult], vaultId: String, call: CAPPluginCall) {
        let total = results.count
        guard total > 0 else { endUI(call, ["added": [] as JSArray, "fromPhotos": 0]); return }
        var added: JSArray = []
        var assetIds: [String] = []
        notifyListeners("progress", data: ["done": 0, "total": total])

        func step(_ i: Int) {
            guard i < total else {
                q.async { self.lastAssetIds = assetIds }
                endUI(call, ["added": added, "fromPhotos": assetIds.count])
                return
            }
            let result = results[i]
            let provider = result.itemProvider
            let isMovie = provider.hasItemConformingToTypeIdentifier(UTType.movie.identifier)
            let type = isMovie ? UTType.movie : UTType.image
            let name = provider.suggestedName ?? (isMovie ? "Vidéo" : "Photo")
            _ = provider.loadFileRepresentation(forTypeIdentifier: type.identifier) { url, _ in
                // L'URL n'existe que pendant ce bloc : on chiffre tout de suite, sans copie en clair.
                if let url = url,
                   let item = try? self.q.sync(execute: {
                       try self.ingest(.file(url), kind: isMovie ? "video" : "photo", name: name,
                                       ext: url.pathExtension, vaultId: vaultId)
                   }) {
                    added.append(item.js)
                    if let aid = result.assetIdentifier { assetIds.append(aid) }
                }
                self.notifyListeners("progress", data: ["done": i + 1, "total": total])
                step(i + 1)
            }
        }
        step(0)
    }

    @objc func importCamera(_ call: CAPPluginCall) {
        withPersistedVault(call) { vaultId in
            guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
                self.fail(call, VaultError.unavailable("Appareil photo indisponible."))
                return
            }
            let picker = UIImagePickerController()
            picker.sourceType = .camera
            picker.mediaTypes = [UTType.image.identifier, UTType.movie.identifier]
            picker.videoQuality = .typeHigh
            let delegate = CameraDelegate { [weak self] info in
                guard let self = self else { return }
                self.cameraDelegate = nil
                guard let info = info else { self.endUI(call, ["added": [] as JSArray, "fromPhotos": 0]); return }
                self.q.async {
                    var out: JSArray = []
                    if let url = info[.mediaURL] as? URL {
                        if let item = try? self.ingest(.file(url), kind: "video", name: "Vidéo",
                                                       ext: url.pathExtension, vaultId: vaultId) {
                            out.append(item.js)
                        }
                        try? FileManager.default.removeItem(at: url)
                    } else if let image = info[.originalImage] as? UIImage,
                              let data = image.jpegData(compressionQuality: 0.92) {
                        if let item = try? self.ingest(.data(data), kind: "photo", name: "Photo",
                                                       ext: "jpg", vaultId: vaultId) {
                            out.append(item.js)
                        }
                    }
                    self.endUI(call, ["added": out, "fromPhotos": 0])
                }
            }
            self.cameraDelegate = delegate
            picker.delegate = delegate
            self.beginUI(call)
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    @objc func importFiles(_ call: CAPPluginCall) {
        withPersistedVault(call) { vaultId in
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: [UTType.item], asCopy: true)
            picker.allowsMultipleSelection = true
            let delegate = DocPickerDelegate { [weak self] urls in
                guard let self = self else { return }
                self.docDelegate = nil
                self.q.async {
                    var out: JSArray = []
                    for (i, url) in urls.enumerated() {
                        let type = UTType(filenameExtension: url.pathExtension)
                        let kind: String
                        if type?.conforms(to: .movie) == true { kind = "video" }
                        else if type?.conforms(to: .image) == true { kind = "photo" }
                        else { kind = "file" }
                        let name = url.deletingPathExtension().lastPathComponent
                        if let item = try? self.ingest(.file(url), kind: kind, name: name,
                                                       ext: url.pathExtension, vaultId: vaultId) {
                            out.append(item.js)
                        }
                        try? FileManager.default.removeItem(at: url)
                        self.notifyListeners("progress", data: ["done": i + 1, "total": urls.count])
                    }
                    self.endUI(call, ["added": out, "fromPhotos": 0])
                }
            }
            self.docDelegate = delegate
            picker.delegate = delegate
            self.beginUI(call)
            self.bridge?.viewController?.present(picker, animated: true)
        }
    }

    /// Supprime de Photos les originaux du dernier import (iOS demande confirmation).
    @objc func deleteOriginals(_ call: CAPPluginCall) {
        q.async {
            let ids = self.lastAssetIds
            guard !ids.isEmpty else { call.resolve(["deleted": false]); return }
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
                guard status == .authorized || status == .limited else {
                    call.resolve(["deleted": false, "denied": true])
                    return
                }
                let assets = PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil)
                guard assets.count > 0 else { call.resolve(["deleted": false]); return }
                PHPhotoLibrary.shared().performChanges({
                    PHAssetChangeRequest.deleteAssets(assets)
                }) { ok, _ in
                    if ok { self.q.async { self.lastAssetIds = [] } }
                    call.resolve(["deleted": ok])
                }
            }
        }
    }

    // MARK: Partage, suppression, réglages

    @objc func share(_ call: CAPPluginCall) {
        let wanted = ids(call)
        q.async {
            do {
                let s = try self.requireSession()
                let dir = Paths.scratch.appendingPathComponent(UUID().uuidString, isDirectory: true)
                try Paths.ensure(dir)
                var urls: [URL] = []
                for (i, id) in wanted.enumerated() {
                    guard let item = s.item(id) else { continue }
                    let sub = dir.appendingPathComponent("\(i)", isDirectory: true)
                    try Paths.ensure(sub)
                    let url = sub.appendingPathComponent(self.fileName(item))
                    try Blob.openFile(s.blobs.appendingPathComponent(id), id: id, key: s.master, to: url)
                    urls.append(url)
                }
                guard !urls.isEmpty else { throw VaultError.notFound }
                DispatchQueue.main.async {
                    guard let vc = self.bridge?.viewController else { return }
                    let sheet = UIActivityViewController(activityItems: urls, applicationActivities: nil)
                    sheet.completionWithItemsHandler = { [weak self] _, _, _, _ in
                        self?.q.asyncAfter(deadline: .now() + 5) { try? FileManager.default.removeItem(at: dir) }
                        self?.endUI(call, [:])
                    }
                    sheet.popoverPresentationController?.sourceView = vc.view
                    self.beginUI(call)
                    vc.present(sheet, animated: true)
                }
            } catch {
                self.fail(call, error)
            }
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        let wanted = Set(ids(call))
        run(call) {
            let s = try self.requirePersisted()
            s.index.items.removeAll { wanted.contains($0.id) }
            try s.saveIndex()
            for id in wanted {
                try? FileManager.default.removeItem(at: s.blobs.appendingPathComponent(id))
                try? FileManager.default.removeItem(at: s.thumbs.appendingPathComponent(id))
            }
            return ["items": s.index.items.map { $0.js } as JSArray]
        }
    }

    @objc func setSetting(_ call: CAPPluginCall) {
        guard let key = call.getString("key") else { call.resolve(); return }
        let value = call.getString("value") ?? ""
        run(call) {
            let s = try self.requireSession()
            s.index.settings[key] = value
            try s.saveIndex()
            return [:]
        }
    }

    /// Efface définitivement le coffre ouvert (fichiers, miniatures, index, clé).
    @objc func destroy(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.dismissEverything()
            self.run(call) {
                let s = try self.requireSession()
                if s.persisted { try FileManager.default.removeItem(at: s.dir) }
                self.wipeSession()
                return [:]
            }
        }
    }

    // MARK: Cycle de vie : cache, verrouillage automatique

    private var isCaptured: Bool {
        #if DEBUG
        return false // en développement, on laisse filmer l'écran pour les démos
        #else
        return UIScreen.main.isCaptured
        #endif
    }

    private func showCover() {
        guard cover == nil, let window = bridge?.viewController?.view.window else { return }
        let v = UIView(frame: window.bounds)
        v.backgroundColor = .black
        v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        if let logo = UIImage(named: "CoverLogo") {
            let iv = UIImageView(image: logo)
            iv.frame = CGRect(x: 0, y: 0, width: 88, height: 88)
            iv.center = CGPoint(x: v.bounds.midX, y: v.bounds.midY)
            iv.layer.cornerRadius = 20
            iv.clipsToBounds = true
            iv.autoresizingMask = [.flexibleTopMargin, .flexibleBottomMargin, .flexibleLeftMargin, .flexibleRightMargin]
            v.addSubview(iv)
        }
        window.addSubview(v)
        cover = v
    }

    private func hideCover() {
        cover?.removeFromSuperview()
        cover = nil
    }

    private func dismissEverything() {
        bridge?.viewController?.presentedViewController?.dismiss(animated: false)
        let pending = uiCalls
        uiCalls = [:]
        for c in pending.values { c.resolve(["added": [] as JSArray, "locked": true]) }
        photoDelegate = nil
        cameraDelegate = nil
        docDelegate = nil
        previewSource = nil
    }

    @objc private func appWillResign() {
        showCover()
    }

    @objc private func appDidEnterBackground() {
        showCover()
        waitingForJS = true
        dismissEverything()
        q.async { self.wipeSession() }
        notifyListeners("locked", data: [:])
    }

    @objc private func appDidBecomeActive() {
        guard !isCaptured else { return }
        if waitingForJS {
            // Filet de sécurité si l'interface ne répond pas.
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in
                guard let self = self, self.waitingForJS else { return }
                self.waitingForJS = false
                if UIApplication.shared.applicationState == .active { self.hideCover() }
            }
        } else {
            hideCover()
        }
    }

    @objc private func captureChanged() {
        if isCaptured {
            showCover()
        } else if UIApplication.shared.applicationState == .active && !waitingForJS {
            hideCover()
        }
    }
}
