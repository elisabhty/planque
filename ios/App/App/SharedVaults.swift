import Foundation
import UIKit
import Capacitor
import CloudKit
import CryptoKit
import AVFoundation

// =====================================================================
//  Planque — coffres partagés (iCloud, chiffrés de bout en bout)
//
//  • Un coffre partagé = une zone CloudKit dans l'iCloud privé de la personne qui l'a créé,
//    partagée en entier (CKShare de zone). iCloud décide qui y accède, et comment :
//    « Lecture seule » (regarder) ou « Modifications autorisées » (ajouter et supprimer),
//    choisi pour chaque invité dans la feuille de partage d'iOS. Ces droits sont appliqués par
//    les serveurs d'Apple : un membre en lecture seule ne peut rien écrire, même avec une appli modifiée.
//
//  • Clé du coffre partagé : 256 bits aléatoires, créée sur l'iPhone du créateur.
//    Elle ne passe JAMAIS par iCloud : on la donne de la main à la main (QR code) ou par un lien
//    où elle se trouve après le « # » (cette partie n'est envoyée à aucun serveur).
//    Sur chaque iPhone, elle est rangée dans l'index chiffré du coffre personnel qui a rejoint
//    le coffre partagé : des cachettes leurres n'y donnent pas accès.
//
//  • Sur iCloud, tout est chiffré : métadonnées (nom, type, dates) en AES-GCM, miniature et
//    fichier au format PLQ1 (blocs AES-GCM). Le titre de l'invitation iCloud est neutre.
//    Apple voit : les comptes membres, le nombre d'éléments, leur taille et leurs dates d'envoi.
//
//  • Copie locale : miniatures et fichiers déjà ouverts restent chiffrés sur l'iPhone
//    (Application Support/Planque/shared/<empreinte>), pour s'ouvrir vite et hors connexion.
// =====================================================================

enum SharedK {
    static let containerId = "iCloud.com.hormend.planque"
    /// Titre visible dans l'invitation iCloud (Messages, Mail) : volontairement neutre.
    static let shareTitle = "Coffre partagé Planque"
    /// Page qui renvoie vers l'appli ; la clé reste après le « # », jamais envoyée au serveur.
    static let keyLinkBase = "https://elisabhty.github.io/planque/cle.html#"
}

// MARK: - Clé à transmettre (QR code, lien)

enum SharedKey {
    struct Payload {
        let zone: String
        let owner: String
        let key: Data
    }

    static func encode(zone: String, owner: String, key: Data) -> String {
        let obj: [String: Any] = ["v": 1, "z": zone, "o": owner, "k": key.base64EncodedString()]
        let json = (try? JSONSerialization.data(withJSONObject: obj, options: [.sortedKeys, .withoutEscapingSlashes])) ?? Data()
        return "PLQS1." + b64url(json)
    }

    static func link(_ payload: String) -> String { SharedK.keyLinkBase + payload }

    /// Accepte le lien complet, le texte d'un message ou la clé seule.
    static func parse(_ text: String) -> Payload? {
        guard let r = text.range(of: "PLQS1\\.[A-Za-z0-9_-]{20,600}", options: .regularExpression) else { return nil }
        let token = String(text[r].dropFirst(6))
        guard let data = unb64url(token),
              let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let z = o["z"] as? String, let ow = o["o"] as? String, let k = o["k"] as? String,
              let key = Data(base64Encoded: k), key.count == 32,
              z.hasPrefix("plq-"), z.count <= 80, !ow.isEmpty, ow.count <= 200 else { return nil }
        return Payload(zone: z, owner: ow, key: key)
    }

    static func b64url(_ d: Data) -> String {
        d.base64EncodedString().replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
    }

    static func unb64url(_ s: String) -> Data? {
        var b = s.replacingOccurrences(of: "-", with: "+").replacingOccurrences(of: "_", with: "/")
        while b.count % 4 != 0 { b += "=" }
        return Data(base64Encoded: b)
    }
}

// MARK: - Référence d'un coffre partagé (dans l'index chiffré du coffre personnel)

struct SharedRef: Codable {
    var id: String            // identifiant local
    var zone: String          // nom de la zone CloudKit
    var owner: String         // nom d'enregistrement iCloud du créateur (propriétaire de la zone)
    var mine: Bool            // la zone est dans MON iCloud (je l'ai créé, depuis ce coffre ou un autre)
    var key: String?          // clé du coffre (base64) ; absente tant qu'on ne l'a pas reçue
    var name: String?         // nom du coffre (copie locale)
    var role: String          // owner | edit | view
    var ownerName: String?    // prénom du créateur, pour l'affichage
    var joined: Double
    var count: Int?
    var gone: Bool?           // le créateur l'a supprimé, ou on n'en fait plus partie

    var zoneID: CKRecordZone.ID {
        CKRecordZone.ID(zoneName: zone, ownerName: mine ? CKCurrentUserDefaultName : owner)
    }
    var database: CKDatabase {
        mine ? SharedHub.container.privateCloudDatabase : SharedHub.container.sharedCloudDatabase
    }
    var shareID: CKRecord.ID { CKRecord.ID(recordName: CKRecordNameZoneWideShare, zoneID: zoneID) }
    var infoID: CKRecord.ID { CKRecord.ID(recordName: "info", zoneID: zoneID) }
    var canEdit: Bool { role == "owner" || role == "edit" }

    var js: JSObject {
        var o: JSObject = ["id": id, "role": role, "mine": mine, "hasKey": key != nil, "joined": joined,
                           "name": name ?? "Coffre partagé", "gone": gone ?? false]
        if let ownerName { o["ownerName"] = ownerName }
        if let count { o["count"] = count }
        return o
    }
}

// MARK: - Copie locale chiffrée d'un coffre partagé

final class SharedVault {
    let refId: String
    let dir: URL
    var key: SymmetricKey?
    var name: String
    var items: [VaultItem] = []
    var token: CKServerChangeToken?
    var members: JSArray = []
    var me: String?

    private struct State: Codable {
        var items: [VaultItem]
        var name: String
        var token: Data?
        var me: String?
    }

    init(ref: SharedRef) {
        refId = ref.id
        name = ref.name ?? "Coffre partagé"
        let digest = Data(SHA256.hash(data: Data("plq-sv|\(ref.owner)|\(ref.zone)".utf8)))
        dir = Paths.root.appendingPathComponent("shared", isDirectory: true)
            .appendingPathComponent(String(digest.hex.prefix(32)), isDirectory: true)
        if let k = ref.key, let raw = Data(base64Encoded: k), raw.count == 32 {
            key = SymmetricKey(data: raw)
            load()
        }
    }

    var blobs: URL { dir.appendingPathComponent("b", isDirectory: true) }
    var thumbs: URL { dir.appendingPathComponent("t", isDirectory: true) }
    var stateFile: URL { dir.appendingPathComponent("state.bin") }

    func item(_ id: String) -> VaultItem? { items.first { $0.id == id } }

    func load() {
        guard let key, let enc = try? Data(contentsOf: stateFile),
              let json = try? Small.open(enc, key: key, aad: "plq-sv-state"),
              let st = try? JSONDecoder().decode(State.self, from: json) else { return }
        items = st.items
        name = st.name
        me = st.me
        if let t = st.token {
            token = try? NSKeyedUnarchiver.unarchivedObject(ofClass: CKServerChangeToken.self, from: t)
        }
    }

    func save() throws {
        guard let key else { return }
        try Paths.ensure(blobs)
        try Paths.ensure(thumbs)
        let t = token.flatMap { try? NSKeyedArchiver.archivedData(withRootObject: $0, requiringSecureCoding: true) }
        let json = try JSONEncoder().encode(State(items: items, name: name, token: t, me: me))
        try writeProtected(try Small.seal(json, key: key, aad: "plq-sv-state"), to: stateFile)
    }

    func wipeLocal() { try? FileManager.default.removeItem(at: dir) }
}

// MARK: - Arrivées (invitation iCloud, lien de clé) et objets d'interface

final class SharedHub {
    static var container: CKContainer { CKContainer(identifier: SharedK.containerId) }
    static let incoming = Notification.Name("PlanqueSharedIncoming")

    var open: [String: SharedVault] = [:]                                        // file q
    var sharing: (controller: UICloudSharingController, delegate: SharingDelegate)? // fil principal
    var scanner: QRScannerController?                                           // fil principal

    private static let lock = NSLock()
    private static var invite: CKShare.Metadata?
    private static var keys: [String] = []

    /// Appelée par la scène quand on touche une invitation iCloud Planque.
    static func receive(invite md: CKShare.Metadata) {
        guard md.containerIdentifier == SharedK.containerId else { return }
        lock.lock(); invite = md; lock.unlock()
        post()
    }

    /// Lien planque://cle#PLQS1… ouvert depuis la page de clé. Renvoie true si c'est pour nous.
    @discardableResult
    static func receive(url: URL) -> Bool {
        guard url.scheme?.lowercased() == "planque" else { return false }
        let text = url.absoluteString
        guard SharedKey.parse(text) != nil else { return true }
        lock.lock()
        if !keys.contains(text) { keys.append(text) }
        lock.unlock()
        post()
        return true
    }

    static func peekInvite() -> JSValue {
        lock.lock(); defer { lock.unlock() }
        guard let md = invite else { return NSNull() }
        let from = displayName(md.ownerIdentity.nameComponents) ?? "Quelqu’un"
        let o: JSObject = ["from": from, "canEdit": md.participantPermission == .readWrite]
        return o
    }

    static func takeInvite() -> CKShare.Metadata? {
        lock.lock(); defer { lock.unlock() }
        let md = invite
        invite = nil
        return md
    }

    static func pendingKeyCount() -> Int {
        lock.lock(); defer { lock.unlock() }
        return keys.count
    }

    static func takeKeys() -> [String] {
        lock.lock(); defer { lock.unlock() }
        let k = keys
        keys = []
        return k
    }

    static func displayName(_ c: PersonNameComponents?) -> String? {
        guard let c else { return nil }
        let f = PersonNameComponentsFormatter()
        f.style = .short
        let s = f.string(from: c).trimmingCharacters(in: .whitespaces)
        return s.isEmpty ? nil : s
    }

    static func members(of share: CKShare) -> JSArray {
        let me = share.currentUserParticipant
        let list: [JSObject] = share.participants.compactMap { p in
            if p.acceptanceStatus == .removed { return nil }
            let role = p.role == .owner ? "owner" : (p.permission == .readWrite ? "edit" : "view")
            let status = p.acceptanceStatus == .accepted ? "accepted" : "pending"
            let name = displayName(p.userIdentity.nameComponents)
                ?? p.userIdentity.lookupInfo?.emailAddress
                ?? p.userIdentity.lookupInfo?.phoneNumber
                ?? "Invité"
            return ["name": name, "role": role, "status": status, "me": me != nil && p == me!]
        }
        return list as JSArray
    }

    static func isSafeId(_ s: String) -> Bool {
        s.range(of: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", options: .regularExpression) != nil
    }

    private static func post() {
        DispatchQueue.main.async { NotificationCenter.default.post(name: incoming, object: nil) }
    }
}

/// Feuille de partage d'iOS (inviter des personnes, choisir leurs droits) ; prévient à la fermeture.
final class SharingController: UICloudSharingController {
    var onClose: (() -> Void)?
    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        if isBeingDismissed || presentingViewController == nil {
            onClose?()
            onClose = nil
        }
    }
}

final class SharingDelegate: NSObject, UICloudSharingControllerDelegate {
    var saved = false
    var stopped = false
    var errorText = ""
    func cloudSharingController(_ csc: UICloudSharingController, failedToSaveShareWithError error: Error) {
        errorText = "L’invitation n’a pas pu être enregistrée sur iCloud."
    }
    func itemTitle(for csc: UICloudSharingController) -> String? { SharedK.shareTitle }
    func cloudSharingControllerDidSaveShare(_ csc: UICloudSharingController) { saved = true }
    func cloudSharingControllerDidStopSharing(_ csc: UICloudSharingController) { stopped = true }
}

/// Lecteur de QR code plein écran : ne garde que les codes Planque attendus (clé de coffre partagé, carte-clé).
final class QRScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onDone: ((String?) -> Void)?
    var accept: (String) -> Bool = { SharedKey.parse($0) != nil }
    var hint = "Vise le QR code affiché dans Planque sur l’autre iPhone."
    private let session = AVCaptureSession()
    private var preview: AVCaptureVideoPreviewLayer?

    init() {
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }
    required init?(coder: NSCoder) { fatalError() }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        if let device = AVCaptureDevice.default(for: .video),
           let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) {
            session.addInput(input)
            let output = AVCaptureMetadataOutput()
            if session.canAddOutput(output) {
                session.addOutput(output)
                output.setMetadataObjectsDelegate(self, queue: .main)
                output.metadataObjectTypes = [.qr]
            }
            let layer = AVCaptureVideoPreviewLayer(session: session)
            layer.videoGravity = .resizeAspectFill
            layer.frame = view.bounds
            view.layer.addSublayer(layer)
            preview = layer
        }

        let frame = UIView()
        frame.translatesAutoresizingMaskIntoConstraints = false
        frame.layer.borderColor = UIColor.white.withAlphaComponent(0.9).cgColor
        frame.layer.borderWidth = 3
        frame.layer.cornerRadius = 28
        view.addSubview(frame)

        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.text = hint
        label.textColor = .white
        label.font = .systemFont(ofSize: 17, weight: .semibold)
        label.textAlignment = .center
        label.numberOfLines = 0
        view.addSubview(label)

        let close = UIButton(type: .system)
        close.translatesAutoresizingMaskIntoConstraints = false
        close.setImage(UIImage(systemName: "xmark", withConfiguration: UIImage.SymbolConfiguration(pointSize: 17, weight: .semibold)), for: .normal)
        close.tintColor = .white
        close.backgroundColor = UIColor(white: 0.15, alpha: 0.8)
        close.layer.cornerRadius = 20
        close.accessibilityLabel = "Fermer"
        close.addTarget(self, action: #selector(closeTapped), for: .touchUpInside)
        view.addSubview(close)

        NSLayoutConstraint.activate([
            frame.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            frame.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -30),
            frame.widthAnchor.constraint(equalToConstant: 250),
            frame.heightAnchor.constraint(equalToConstant: 250),
            label.topAnchor.constraint(equalTo: frame.bottomAnchor, constant: 24),
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 32),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -32),
            close.widthAnchor.constraint(equalToConstant: 40),
            close.heightAnchor.constraint(equalToConstant: 40),
            close.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            close.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8)
        ])
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview?.frame = view.bounds
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        let s = session
        DispatchQueue.global(qos: .userInitiated).async { if !s.isRunning { s.startRunning() } }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        let s = session
        DispatchQueue.global(qos: .userInitiated).async { if s.isRunning { s.stopRunning() } }
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject],
                        from connection: AVCaptureConnection) {
        guard let obj = metadataObjects.first as? AVMetadataMachineReadableCodeObject,
              let text = obj.stringValue, accept(text) else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        finish(text)
    }

    @objc private func closeTapped() { finish(nil) }

    private func finish(_ text: String?) {
        guard let cb = onDone else { return }
        onDone = nil
        dismiss(animated: true) { cb(text) }
    }
}

// MARK: - Plugin : coffres partagés

struct SharedCtx {
    let ref: SharedRef
    let key: SymmetricKey
    let blobs: URL
    let thumbs: URL
}

extension VaultPlugin {

    // MARK: Aides

    /// Exécute un bloc sur la file q depuis du code asynchrone.
    func onQ<T>(_ work: @escaping () throws -> T) async throws -> T {
        try await withCheckedThrowingContinuation { (cont: CheckedContinuation<T, Error>) in
            q.async {
                do { cont.resume(returning: try work()) } catch { cont.resume(throwing: error) }
            }
        }
    }

    func runAsync(_ call: CAPPluginCall, _ work: @escaping () async throws -> JSObject) {
        Task {
            do { call.resolve(try await work()) } catch { self.fail(call, self.friendly(error)) }
        }
    }

    /// Erreurs iCloud → messages compréhensibles.
    func friendly(_ error: Error) -> Error {
        if error is VaultError { return error }
        guard var ck = error as? CKError else { return error }
        if ck.code == .partialFailure, let first = ck.partialErrorsByItemID?.values.first as? CKError { ck = first }
        switch ck.code {
        case .notAuthenticated:
            return VaultError.unavailable("Connecte-toi à iCloud (Réglages › ton nom) pour utiliser les coffres partagés.")
        case .networkUnavailable, .networkFailure, .serviceUnavailable, .requestRateLimited, .zoneBusy:
            return VaultError.unavailable("iCloud ne répond pas. Vérifie ta connexion et réessaie.")
        case .quotaExceeded:
            return VaultError.unavailable("L’espace iCloud de la personne qui a créé ce coffre est plein.")
        case .permissionFailure:
            return VaultError.unavailable("Tu peux regarder ce coffre, pas le modifier.")
        case .zoneNotFound, .userDeletedZone:
            return VaultError.unavailable("Ce coffre partagé n’existe plus.")
        case .unknownItem:
            return VaultError.notFound
        case .participantMayNeedVerification:
            return VaultError.unavailable("Ouvre l’invitation iCloud reçue pour confirmer ton compte.")
        case .limitExceeded, .assetFileModified:
            return VaultError.unavailable("Ce fichier est trop gros pour iCloud.")
        case .badContainer, .missingEntitlement:
            return VaultError.unavailable("iCloud n’est pas configuré pour Planque sur cet iPhone.")
        default:
            return VaultError.unavailable("iCloud n’a pas répondu comme prévu. Réessaie dans un instant.")
        }
    }

    func requireICloud() async throws {
        let status = try await SharedHub.container.accountStatus()
        guard status == .available else {
            throw VaultError.unavailable("Connecte-toi à iCloud (Réglages › ton nom) pour utiliser les coffres partagés.")
        }
    }

    /// File q.
    func sharedList(_ s: VaultSession) -> JSArray {
        (s.index.shared ?? []).map { $0.js } as JSArray
    }

    /// File q. Référence + copie locale (chargée une fois par ouverture du coffre).
    func openShared(_ id: String) throws -> (SharedRef, SharedVault) {
        let s = try requirePersisted()
        guard let ref = (s.index.shared ?? []).first(where: { $0.id == id }) else { throw VaultError.notFound }
        if let sv = hub.open[id] {
            if sv.key == nil, let k = ref.key, let raw = Data(base64Encoded: k), raw.count == 32 {
                sv.key = SymmetricKey(data: raw)
                sv.load()
            }
            return (ref, sv)
        }
        let sv = SharedVault(ref: ref)
        hub.open[id] = sv
        return (ref, sv)
    }

    /// File q. Modifie une référence et réenregistre l'index du coffre.
    @discardableResult
    func updateRef(_ id: String, _ mutate: (inout SharedRef) -> Void) throws -> SharedRef {
        let s = try requirePersisted()
        var list = s.index.shared ?? []
        guard let i = list.firstIndex(where: { $0.id == id }) else { throw VaultError.notFound }
        mutate(&list[i])
        s.index.shared = list
        try s.saveIndex()
        return list[i]
    }

    /// File q.
    func sharedStore(_ id: String) throws -> ItemStore {
        let (_, sv) = try openShared(id)
        guard let key = sv.key else { throw VaultError.unavailable("Il te manque la clé de ce coffre partagé.") }
        return ItemStore(key: key, blobs: sv.blobs, thumbs: sv.thumbs, prefix: "s:", items: sv.items)
    }

    /// File q.
    func requireSharedWritable(_ id: String) throws {
        let (ref, sv) = try openShared(id)
        guard sv.key != nil else { throw VaultError.unavailable("Il te manque la clé de ce coffre partagé.") }
        guard ref.canEdit else { throw VaultError.unavailable("Tu peux regarder ce coffre, pas y ajouter de fichiers.") }
    }

    func sharedCtx(_ id: String) async throws -> SharedCtx {
        try await onQ { () -> SharedCtx in
            let (ref, sv) = try self.openShared(id)
            guard let key = sv.key else { throw VaultError.unavailable("Il te manque la clé de ce coffre partagé.") }
            return SharedCtx(ref: ref, key: key, blobs: sv.blobs, thumbs: sv.thumbs)
        }
    }

    /// File q.
    func sharedPayload(_ ref: SharedRef, _ sv: SharedVault) -> JSObject {
        ["shared": ref.js, "items": sv.items.map { $0.js } as JSArray, "name": sv.name,
         "needKey": sv.key == nil, "members": sv.members, "role": ref.role, "gone": ref.gone ?? false,
         "me": sv.me ?? ""]
    }

    func infoRecord(_ zoneID: CKRecordZone.ID, name: String, key: SymmetricKey) throws -> CKRecord {
        let rec = CKRecord(recordType: "Info", recordID: CKRecord.ID(recordName: "info", zoneID: zoneID))
        let json = try JSONSerialization.data(withJSONObject: ["name": name])
        rec["m"] = try Small.seal(json, key: key, aad: "plq-sv-info") as CKRecordValue
        return rec
    }

    // MARK: Fichiers : chiffrer, envoyer, télécharger

    /// File q. Chiffre une source dans la copie locale du coffre partagé (envoyée ensuite par uploadShared).
    func ingestShared(_ src: Source, kind: String, name: String, ext: String, sv id: String) throws -> VaultItem {
        let (_, sv) = try openShared(id)
        guard let key = sv.key else { throw VaultError.locked }
        try Paths.ensure(sv.blobs)
        try Paths.ensure(sv.thumbs)
        let itemId = UUID().uuidString.lowercased()
        var item = VaultItem(id: itemId, kind: kind, name: name, ext: ext.lowercased(), size: 0,
                             added: Date().timeIntervalSince1970 * 1000)
        let blob = sv.blobs.appendingPathComponent(itemId)
        switch src {
        case .file(let url):
            item.size = try fileSize(url)
            try Blob.seal(file: url, id: "s:" + itemId, key: key, to: blob)
        case .data(let d):
            item.size = d.count
            try Blob.seal(data: d, id: "s:" + itemId, key: key, to: blob)
        }
        let info = Media.inspect(src, kind: kind)
        item.width = info.width
        item.height = info.height
        item.duration = info.duration
        item.taken = info.taken
        item.by = sv.me
        if let thumb = info.thumb {
            try Blob.seal(data: thumb, id: "s:" + itemId + ".t", key: key, to: sv.thumbs.appendingPathComponent(itemId))
            item.hasThumb = true
        }
        return item
    }

    /// Envoie vers iCloud les éléments chiffrés localement. Renvoie ceux qui sont partis et le nombre d'échecs.
    func uploadShared(_ id: String, items: [VaultItem]) async -> ([VaultItem], Int) {
        guard let ctx = try? await sharedCtx(id) else { return ([], items.count) }
        var sent: [VaultItem] = []
        let total = items.count
        notifyListeners("progress", data: ["done": 0, "total": total, "phase": "upload"])
        for (i, item) in items.enumerated() {
            let blob = ctx.blobs.appendingPathComponent(item.id)
            let thumb = ctx.thumbs.appendingPathComponent(item.id)
            do {
                let rec = CKRecord(recordType: "Item", recordID: CKRecord.ID(recordName: item.id, zoneID: ctx.ref.zoneID))
                var meta = item
                meta.album = nil
                meta.deleted = nil
                rec["m"] = try Small.seal(try JSONEncoder().encode(meta), key: ctx.key, aad: "plq-sv-meta|\(item.id)") as CKRecordValue
                rec["b"] = CKAsset(fileURL: blob)
                if item.hasThumb { rec["t"] = CKAsset(fileURL: thumb) }
                let res = try await ctx.ref.database.modifyRecords(saving: [rec], deleting: [])
                for (_, r) in res.saveResults { _ = try r.get() }
                sent.append(item)
            } catch {
                try? FileManager.default.removeItem(at: blob)
                try? FileManager.default.removeItem(at: thumb)
            }
            notifyListeners("progress", data: ["done": i + 1, "total": total, "phase": "upload"])
        }
        let done = sent
        _ = try? await onQ { () -> Void in
            guard let sv = self.hub.open[id] else { return }
            let known = Set(sv.items.map { $0.id })
            sv.items.insert(contentsOf: done.filter { !known.contains($0.id) }, at: 0)
            try? sv.save()
            try? self.updateRef(id) { $0.count = sv.items.count }
        }
        return (sent, items.count - sent.count)
    }

    /// Télécharge (toujours chiffrés) les fichiers pas encore présents sur cet iPhone.
    func downloadBlobs(_ id: String, ids wanted: [String]) async throws {
        let ctx = try await sharedCtx(id)
        let missing = try await onQ {
            wanted.filter { SharedHub.isSafeId($0) && !FileManager.default.fileExists(atPath: ctx.blobs.appendingPathComponent($0).path) }
        }
        guard !missing.isEmpty else { return }
        var start = 0
        while start < missing.count {
            let batch = Array(missing[start..<min(start + 10, missing.count)])
            start += 10
            let res = try await ctx.ref.database.records(for: batch.map { CKRecord.ID(recordName: $0, zoneID: ctx.ref.zoneID) },
                                                         desiredKeys: ["b"])
            try await onQ { () -> Void in
                try Paths.ensure(ctx.blobs)
                for (rid, r) in res {
                    guard SharedHub.isSafeId(rid.recordName), case .success(let rec) = r,
                          let asset = rec["b"] as? CKAsset, let url = asset.fileURL else { continue }
                    let dst = ctx.blobs.appendingPathComponent(rid.recordName)
                    try? FileManager.default.removeItem(at: dst)
                    try FileManager.default.copyItem(at: url, to: dst)
                    try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: dst.path)
                }
            }
        }
    }

    // MARK: Créer, ouvrir, synchroniser

    @objc func sharedCreate(_ call: CAPPluginCall) {
        let name = String((call.getString("name") ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(40))
        runAsync(call) {
            guard !name.isEmpty else { throw VaultError.io("Donne un nom au coffre partagé.") }
            let vaultId = try await self.onQ { try self.requirePersisted().vaultId }
            try await self.requireICloud()
            let container = SharedHub.container
            let me = try await container.userRecordID().recordName
            let db = container.privateCloudDatabase
            let zone = CKRecordZone(zoneName: "plq-" + UUID().uuidString.lowercased())
            let zres = try await db.modifyRecordZones(saving: [zone], deleting: [])
            _ = try zres.saveResults[zone.zoneID]?.get()

            let raw = try randomBytes(32)
            let key = SymmetricKey(data: raw)
            let share = CKShare(recordZoneID: zone.zoneID)
            share[CKShare.SystemFieldKey.title] = SharedK.shareTitle as CKRecordValue
            share.publicPermission = .none
            let info = try self.infoRecord(zone.zoneID, name: name, key: key)
            let res = try await db.modifyRecords(saving: [share, info], deleting: [])
            for (_, r) in res.saveResults { _ = try r.get() }

            return try await self.onQ { () -> JSObject in
                let s = try self.requirePersisted()
                guard s.vaultId == vaultId else { throw VaultError.locked }
                let ref = SharedRef(id: UUID().uuidString.lowercased(), zone: zone.zoneID.zoneName, owner: me, mine: true,
                                    key: raw.base64EncodedString(), name: name, role: "owner", ownerName: nil,
                                    joined: Date().timeIntervalSince1970 * 1000, count: 0, gone: nil)
                s.index.shared = (s.index.shared ?? []) + [ref]
                try s.saveIndex()
                let sv = SharedVault(ref: ref)
                sv.name = name
                try sv.save()
                self.hub.open[ref.id] = sv
                return ["shared": ref.js, "list": self.sharedList(s)]
            }
        }
    }

    /// Affiche tout de suite la copie locale ; sharedSync va ensuite chercher les nouveautés.
    @objc func sharedOpen(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        run(call) {
            let (ref, sv) = try self.openShared(id)
            return self.sharedPayload(ref, sv)
        }
    }

    @objc func sharedSync(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        runAsync(call) { try await self.syncShared(id) }
    }

    func markGone(_ id: String) async throws -> JSObject {
        try await onQ { () -> JSObject in
            let r = try self.updateRef(id) { $0.gone = true }
            let (_, sv) = try self.openShared(id)
            var out = self.sharedPayload(r, sv)
            out["list"] = self.sharedList(try self.requirePersisted())
            return out
        }
    }

    func syncShared(_ id: String) async throws -> JSObject {
        let (ref, hasKey, startToken) = try await onQ { () -> (SharedRef, Bool, CKServerChangeToken?) in
            let (r, sv) = try self.openShared(id)
            return (r, sv.key != nil, sv.token)
        }
        let db = ref.database

        // 1. Membres et droits (appliqués par iCloud)
        var members: JSArray = []
        var role = ref.role
        var me: String?
        do {
            if let share = try await db.record(for: ref.shareID) as? CKShare {
                members = SharedHub.members(of: share)
                if let cur = share.currentUserParticipant {
                    me = SharedHub.displayName(cur.userIdentity.nameComponents)
                    role = cur.role == .owner ? "owner" : (cur.permission == .readWrite ? "edit" : "view")
                }
            }
        } catch let e as CKError where e.code == .unknownItem {
            if !ref.mine { return try await markGone(id) } // le créateur a arrêté le partage
        } catch let e as CKError where e.code == .zoneNotFound || e.code == .userDeletedZone {
            return try await markGone(id)
        }
        let finalRole = role
        let finalMembers = members
        let finalMe = me

        guard hasKey else {
            return try await onQ { () -> JSObject in
                let r = try self.updateRef(id) { $0.role = finalRole; $0.gone = nil }
                let (_, sv) = try self.openShared(id)
                sv.members = finalMembers
                var out = self.sharedPayload(r, sv)
                out["list"] = self.sharedList(try self.requirePersisted())
                return out
            }
        }

        // 2. Changements depuis la dernière synchro
        var token = startToken
        var records: [CKRecord] = []
        var deleted: [CKRecord.ID] = []
        var reset = false
        var more = true
        while more {
            let r: (modificationResultsByID: [CKRecord.ID: Result<CKDatabase.RecordZoneChange.Modification, Error>],
                    deletions: [CKDatabase.RecordZoneChange.Deletion], changeToken: CKServerChangeToken, moreComing: Bool)
            do {
                r = try await db.recordZoneChanges(inZoneWith: ref.zoneID, since: token, desiredKeys: ["m", "t"])
            } catch let e as CKError where e.code == .changeTokenExpired && token != nil {
                token = nil
                records = []
                deleted = []
                reset = true
                continue
            } catch let e as CKError where e.code == .zoneNotFound || e.code == .userDeletedZone {
                return try await markGone(id)
            }
            for (_, res) in r.modificationResultsByID {
                if case .success(let mod) = res { records.append(mod.record) }
            }
            deleted += r.deletions.map { $0.recordID }
            token = r.changeToken
            more = r.moreComing
        }
        let finalToken = token
        let fetched = records
        let removed = deleted
        let fullReset = reset
        let initial = startToken == nil   // première synchro sur cet iPhone : rien n'est « nouveau »

        // 3. Déchiffrer et ranger dans la copie locale
        return try await onQ { () -> JSObject in
            let (_, sv) = try self.openShared(id)
            guard let key = sv.key else { throw VaultError.locked }
            try Paths.ensure(sv.blobs)
            try Paths.ensure(sv.thumbs)
            var byId = Dictionary((fullReset ? [] : sv.items).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
            var added: [VaultItem] = []
            for rec in fetched {
                let rid = rec.recordID.recordName
                if rec.recordType == "Info" {
                    if let m = rec["m"] as? Data, let json = try? Small.open(m, key: key, aad: "plq-sv-info"),
                       let o = try? JSONSerialization.jsonObject(with: json) as? [String: Any], let n = o["name"] as? String {
                        sv.name = String(n.prefix(40))
                    }
                    continue
                }
                guard rec.recordType == "Item", SharedHub.isSafeId(rid), let m = rec["m"] as? Data,
                      let json = try? Small.open(m, key: key, aad: "plq-sv-meta|\(rid)"),
                      var item = try? JSONDecoder().decode(VaultItem.self, from: json), item.id == rid else { continue }
                item.album = nil
                item.deleted = nil
                item.hasThumb = false
                if let t = rec["t"] as? CKAsset, let url = t.fileURL {
                    let dst = sv.thumbs.appendingPathComponent(rid)
                    try? FileManager.default.removeItem(at: dst)
                    if (try? FileManager.default.copyItem(at: url, to: dst)) != nil {
                        try? FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: dst.path)
                        item.hasThumb = true
                    }
                }
                if byId[rid] == nil && !fullReset && !initial { added.append(item) }
                byId[rid] = item
            }
            for d in removed {
                let rid = d.recordName
                byId.removeValue(forKey: rid)
                if SharedHub.isSafeId(rid) {
                    try? FileManager.default.removeItem(at: sv.blobs.appendingPathComponent(rid))
                    try? FileManager.default.removeItem(at: sv.thumbs.appendingPathComponent(rid))
                }
            }
            sv.items = byId.values.sorted { $0.added > $1.added }
            sv.token = finalToken
            sv.members = finalMembers
            if let m = finalMe { sv.me = m }
            try sv.save()
            let r = try self.updateRef(id) { $0.role = finalRole; $0.name = sv.name; $0.count = sv.items.count; $0.gone = nil }
            var out = self.sharedPayload(r, sv)
            out["added"] = added.map { $0.js } as JSArray
            out["list"] = self.sharedList(try self.requirePersisted())
            return out
        }
    }

    // MARK: Inviter, donner la clé

    /// Feuille de partage d'iOS : choisir les personnes et leurs droits (lecture seule, ou modifications).
    @objc func sharedInvite(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        Task {
            do {
                let ref = try await self.onQ { try self.openShared(id).0 }
                guard ref.mine, ref.role == "owner" else {
                    throw VaultError.unavailable("Seule la personne qui a créé ce coffre peut inviter.")
                }
                try await self.requireICloud()
                let db = ref.database
                var share: CKShare
                do {
                    guard let s = try await db.record(for: ref.shareID) as? CKShare else { throw VaultError.corrupted }
                    share = s
                } catch let e as CKError where e.code == .unknownItem {
                    // partage arrêté plus tôt : on en recrée un
                    let s = CKShare(recordZoneID: ref.zoneID)
                    s[CKShare.SystemFieldKey.title] = SharedK.shareTitle as CKRecordValue
                    s.publicPermission = .none
                    let res = try await db.modifyRecords(saving: [s], deleting: [])
                    guard let saved = try res.saveResults[s.recordID]?.get() as? CKShare else { throw VaultError.corrupted }
                    share = saved
                }
                let ready = share
                await MainActor.run { self.presentSharing(ready, call: call) }
            } catch {
                self.fail(call, self.friendly(error))
            }
        }
    }

    func presentSharing(_ share: CKShare, call: CAPPluginCall) {
        guard let vc = bridge?.viewController else { fail(call, VaultError.unavailable("Affichage impossible.")); return }
        let delegate = SharingDelegate()
        let controller = SharingController(share: share, container: SharedHub.container)
        controller.availablePermissions = [.allowPrivate, .allowReadOnly, .allowReadWrite]
        controller.delegate = delegate
        controller.modalPresentationStyle = .formSheet
        controller.onClose = { [weak self] in
            self?.hub.sharing = nil
            self?.endUI(call, ["saved": delegate.saved, "stopped": delegate.stopped, "error": delegate.errorText])
        }
        hub.sharing = (controller: controller as UICloudSharingController, delegate: delegate)
        beginUI(call)
        vc.present(controller, animated: true)
    }

    /// Clé du coffre partagé, pour le QR code et le lien. Tout membre qui l'a peut la donner.
    @objc func sharedKey(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        run(call) {
            let (ref, _) = try self.openShared(id)
            guard let k = ref.key, let raw = Data(base64Encoded: k) else {
                throw VaultError.unavailable("Il te manque la clé de ce coffre partagé.")
            }
            let payload = SharedKey.encode(zone: ref.zone, owner: ref.owner, key: raw)
            return ["payload": payload, "link": SharedKey.link(payload)]
        }
    }

    /// Envoie le lien de la clé par la feuille de partage (Messages, AirDrop…).
    @objc func sharedSendKey(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        q.async {
            do {
                let (ref, _) = try self.openShared(id)
                guard let k = ref.key, let raw = Data(base64Encoded: k) else {
                    throw VaultError.unavailable("Il te manque la clé de ce coffre partagé.")
                }
                let link = SharedKey.link(SharedKey.encode(zone: ref.zone, owner: ref.owner, key: raw))
                let text = "Clé de notre coffre partagé Planque. Ouvre ce lien sur ton iPhone, après avoir accepté l’invitation iCloud :\n\(link)"
                DispatchQueue.main.async {
                    guard let vc = self.bridge?.viewController else { return }
                    let sheet = UIActivityViewController(activityItems: [text], applicationActivities: nil)
                    sheet.completionWithItemsHandler = { [weak self] _, completed, _, _ in
                        self?.endUI(call, ["done": completed])
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

    /// Scanne le QR code de clé affiché par un autre membre.
    @objc func sharedScan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard AVCaptureDevice.default(for: .video) != nil else {
                self.fail(call, VaultError.unavailable("Appareil photo indisponible."))
                return
            }
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    guard granted else {
                        call.resolve(["text": "", "denied": true])
                        return
                    }
                    guard let vc = self.bridge?.viewController else { call.resolve(["text": ""]); return }
                    let scanner = QRScannerController()
                    scanner.onDone = { [weak self] text in
                        self?.hub.scanner = nil
                        self?.endUI(call, ["text": text ?? ""])
                    }
                    self.hub.scanner = scanner
                    self.beginUI(call)
                    vc.present(scanner, animated: true)
                }
            }
        }
    }

    // MARK: Rejoindre

    /// Ajoute une clé (texte collé, QR code scanné, ou liens reçus en attente si « text » est vide).
    @objc func sharedAddKey(_ call: CAPPluginCall) {
        let text = call.getString("text") ?? ""
        runAsync(call) {
            let texts = text.isEmpty ? SharedHub.takeKeys() : [text]
            guard !texts.isEmpty else { return ["status": "none"] }
            var last: JSObject = [:]
            for t in texts { last = try await self.addKey(t) }
            return last
        }
    }

    func addKey(_ text: String) async throws -> JSObject {
        guard let p = SharedKey.parse(text) else {
            throw VaultError.io("Ce n’est pas une clé de coffre partagé Planque.")
        }
        try await requireICloud()
        let me = try? await SharedHub.container.userRecordID().recordName
        let mine = me == p.owner
        let keyB64 = p.key.base64EncodedString()

        // Créer ou compléter la référence (dans l'index chiffré du coffre ouvert)
        let (refId, created, hadKey) = try await onQ { () -> (String, Bool, Bool) in
            let s = try self.requirePersisted()
            var list = s.index.shared ?? []
            if let i = list.firstIndex(where: { $0.zone == p.zone && $0.owner == p.owner }) {
                let had = list[i].key != nil
                if !had { list[i].key = keyB64 }
                s.index.shared = list
                try s.saveIndex()
                self.hub.open.removeValue(forKey: list[i].id)
                return (list[i].id, false, had)
            }
            let ref = SharedRef(id: UUID().uuidString.lowercased(), zone: p.zone, owner: p.owner, mine: mine,
                                key: keyB64, name: nil, role: mine ? "owner" : "view", ownerName: nil,
                                joined: Date().timeIntervalSince1970 * 1000, count: nil, gone: nil)
            s.index.shared = list + [ref]
            try s.saveIndex()
            return (ref.id, true, false)
        }
        if hadKey {
            var out = try await syncShared(refId)
            out["status"] = "already"
            return out
        }

        // Vérifier la clé avec la fiche « info » du coffre (chiffrée avec cette clé)
        let ref = try await onQ { try self.openShared(refId).0 }
        let info: CKRecord
        do {
            info = try await ref.database.record(for: ref.infoID)
        } catch let e as CKError where [CKError.Code.zoneNotFound, .unknownItem, .permissionFailure,
                                         .participantMayNeedVerification].contains(e.code) {
            // Pas encore membre : on garde la clé, elle servira dès que l'invitation iCloud sera acceptée.
            return try await onQ { () -> JSObject in
                let s = try self.requirePersisted()
                var out: JSObject = ["status": "waiting", "list": self.sharedList(s)]
                if let r = (s.index.shared ?? []).first(where: { $0.id == refId }) { out["shared"] = r.js }
                return out
            }
        }
        guard let m = info["m"] as? Data,
              (try? Small.open(m, key: SymmetricKey(data: p.key), aad: "plq-sv-info")) != nil else {
            try await onQ { () -> Void in
                let s = try self.requirePersisted()
                if created {
                    s.index.shared = (s.index.shared ?? []).filter { $0.id != refId }
                } else {
                    var list = s.index.shared ?? []
                    if let i = list.firstIndex(where: { $0.id == refId }) { list[i].key = nil }
                    s.index.shared = list
                }
                try s.saveIndex()
                self.hub.open.removeValue(forKey: refId)
            }
            throw VaultError.io("Cette clé ne correspond pas à ce coffre partagé.")
        }
        var out = try await syncShared(refId)
        out["status"] = "ready"
        return out
    }

    /// Accepte l'invitation iCloud reçue (après confirmation dans l'interface).
    @objc func sharedAccept(_ call: CAPPluginCall) {
        runAsync(call) {
            _ = try await self.onQ { () -> Bool in _ = try self.requirePersisted(); return true }
            guard let md = SharedHub.takeInvite() else { return ["accepted": false] }
            if md.participantRole == .owner { return ["accepted": false, "mine": true] }
            do {
                _ = try await SharedHub.container.accept(md)
            } catch {
                SharedHub.receive(invite: md) // pour pouvoir réessayer
                throw error
            }
            let zoneID = md.share.recordID.zoneID
            let role = md.participantPermission == .readWrite ? "edit" : "view"
            let ownerName = SharedHub.displayName(md.ownerIdentity.nameComponents)
            let refId = try await self.onQ { () -> String in
                let s = try self.requirePersisted()
                var list = s.index.shared ?? []
                if let i = list.firstIndex(where: { $0.zone == zoneID.zoneName && $0.owner == zoneID.ownerName }) {
                    list[i].role = role
                    list[i].ownerName = ownerName
                    list[i].gone = nil
                    s.index.shared = list
                    try s.saveIndex()
                    return list[i].id
                }
                let ref = SharedRef(id: UUID().uuidString.lowercased(), zone: zoneID.zoneName, owner: zoneID.ownerName,
                                    mine: false, key: nil, name: nil, role: role, ownerName: ownerName,
                                    joined: Date().timeIntervalSince1970 * 1000, count: nil, gone: nil)
                s.index.shared = list + [ref]
                try s.saveIndex()
                return ref.id
            }
            // Liens de clé ouverts avant l'invitation
            for t in SharedHub.takeKeys() { _ = try? await self.addKey(t) }
            var out = try await self.syncShared(refId)
            out["accepted"] = true
            return out
        }
    }

    @objc func sharedDecline(_ call: CAPPluginCall) {
        _ = SharedHub.takeInvite()
        call.resolve()
    }

    // MARK: Gérer

    @objc func sharedRename(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        let name = String((call.getString("name") ?? "").trimmingCharacters(in: .whitespacesAndNewlines).prefix(40))
        runAsync(call) {
            guard !name.isEmpty else { throw VaultError.io("Donne un nom au coffre partagé.") }
            let ctx = try await self.sharedCtx(id)
            guard ctx.ref.canEdit else { throw VaultError.unavailable("Tu peux regarder ce coffre, pas le renommer.") }
            let rec = try self.infoRecord(ctx.ref.zoneID, name: name, key: ctx.key)
            let res = try await ctx.ref.database.modifyRecords(saving: [rec], deleting: [], savePolicy: .allKeys)
            for (_, r) in res.saveResults { _ = try r.get() }
            return try await self.onQ { () -> JSObject in
                let (_, sv) = try self.openShared(id)
                sv.name = name
                try sv.save()
                let r = try self.updateRef(id) { $0.name = name }
                var out = self.sharedPayload(r, sv)
                out["list"] = self.sharedList(try self.requirePersisted())
                return out
            }
        }
    }

    /// Supprime des éléments pour tous les membres (droit « modifications » requis, vérifié aussi par iCloud).
    func sharedRemove(_ call: CAPPluginCall, sv id: String) {
        let wanted = ids(call).filter { SharedHub.isSafeId($0) }
        runAsync(call) {
            let ctx = try await self.sharedCtx(id)
            guard ctx.ref.canEdit else { throw VaultError.unavailable("Tu peux regarder ce coffre, pas en supprimer.") }
            let recIDs = wanted.map { CKRecord.ID(recordName: $0, zoneID: ctx.ref.zoneID) }
            let res = try await ctx.ref.database.modifyRecords(saving: [], deleting: recIDs,
                                                               savePolicy: .ifServerRecordUnchanged, atomically: false)
            var gone = Set<String>()
            for (rid, r) in res.deleteResults {
                switch r {
                case .success: gone.insert(rid.recordName)
                case .failure(let e): if (e as? CKError)?.code == .unknownItem { gone.insert(rid.recordName) }
                }
            }
            let removed = gone
            return try await self.onQ { () -> JSObject in
                let (_, sv) = try self.openShared(id)
                sv.items.removeAll { removed.contains($0.id) }
                for rid in removed {
                    try? FileManager.default.removeItem(at: sv.blobs.appendingPathComponent(rid))
                    try? FileManager.default.removeItem(at: sv.thumbs.appendingPathComponent(rid))
                }
                try sv.save()
                try self.updateRef(id) { $0.count = sv.items.count }
                return ["items": sv.items.map { $0.js } as JSArray, "removed": removed.count]
            }
        }
    }

    /// Quitter un coffre partagé, ou (créateur, everyone) le supprimer pour tout le monde.
    @objc func sharedLeave(_ call: CAPPluginCall) {
        let id = call.getString("id") ?? ""
        let everyone = call.getBool("everyone") ?? false
        runAsync(call) {
            let ref = try await self.onQ { try self.openShared(id).0 }
            if !(ref.gone ?? false) {
                if ref.mine {
                    if everyone {
                        do { _ = try await ref.database.modifyRecordZones(saving: [], deleting: [ref.zoneID]) }
                        catch let e as CKError where e.code == .zoneNotFound || e.code == .userDeletedZone {}
                    }
                    // sinon : on le retire seulement de ce coffre-ci, rien n'est effacé sur iCloud
                } else {
                    do { _ = try await ref.database.deleteRecord(withID: ref.shareID) }
                    catch let e as CKError where e.code == .unknownItem || e.code == .zoneNotFound || e.code == .userDeletedZone {}
                }
            }
            return try await self.onQ { () -> JSObject in
                let s = try self.requirePersisted()
                s.index.shared = (s.index.shared ?? []).filter { $0.id != id }
                try s.saveIndex()
                let sv = self.hub.open.removeValue(forKey: id) ?? SharedVault(ref: ref)
                sv.wipeLocal()
                return ["list": self.sharedList(s)]
            }
        }
    }

    /// Garde une copie d'éléments du coffre partagé dans le coffre personnel ouvert.
    @objc func sharedCopy(_ call: CAPPluginCall) {
        let sv = call.getString("sv") ?? ""
        let wanted = ids(call)
        prefetch(call, wanted) {
            self.run(call) {
                let s = try self.requirePersisted()
                let st = try self.sharedStore(sv)
                var added: [VaultItem] = []
                for id in wanted {
                    guard let item = st.item(id) else { continue }
                    let dir = Paths.scratch.appendingPathComponent(UUID().uuidString, isDirectory: true)
                    try Paths.ensure(dir)
                    defer { try? FileManager.default.removeItem(at: dir) }
                    let url = dir.appendingPathComponent(self.fileName(item))
                    try Blob.openFile(st.blob(id), id: st.blobId(id), key: st.key, to: url)
                    var copy = try self.ingest(.file(url), kind: item.kind, name: item.name, ext: item.ext, vaultId: s.vaultId)
                    if copy.taken == nil, let t = item.taken, let i = s.index.items.firstIndex(where: { $0.id == copy.id }) {
                        s.index.items[i].taken = t
                        copy.taken = t
                        try s.saveIndex()
                    }
                    added.append(copy)
                }
                return ["added": added.map { $0.js } as JSArray, "items": s.index.items.map { $0.js } as JSArray]
            }
        }
    }
}
