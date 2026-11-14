import Foundation
import UIKit
import Capacitor
import CryptoKit
import Security
import LocalAuthentication
import AVFoundation

// =====================================================================
//  Planque — autour du cadran : frein aux essais, Face ID, carte-clé de secours
// =====================================================================

// MARK: - Frein aux essais

/// Compteur d'essais ratés, gardé dans le trousseau (il survit à une désinstallation).
/// Un essai « raté » = une combinaison qui n'ouvre aucun coffre existant.
/// Au-delà de 5, attente croissante (30 s → 1 h). Le compteur baisse d'un cran par heure sans essai raté.
/// Ouvrir un coffre ne remet PAS le compteur à zéro : ouvrir le coffre leurre entre deux essais ne sert à rien.
enum Throttle {
    private static let account = "throttle-v1"
    private struct State: Codable { var misses: Int; var last: Double }

    private static func query() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: K.service,
         kSecAttrAccount as String: account]
    }

    private static func read() -> State {
        var q = query()
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: CFTypeRef?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess, let d = out as? Data,
              let st = try? JSONDecoder().decode(State.self, from: d) else { return State(misses: 0, last: 0) }
        return st
    }

    private static func write(_ st: State) {
        guard let d = try? JSONEncoder().encode(st) else { return }
        let q = query()
        if SecItemUpdate(q as CFDictionary, [kSecValueData as String: d] as CFDictionary) == errSecItemNotFound {
            var add = q
            add[kSecValueData as String] = d
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            SecItemAdd(add as CFDictionary, nil)
        }
    }

    /// Essais ratés « actifs » : un de moins par heure écoulée depuis le dernier.
    private static func effective(_ st: State, now: Double) -> Int {
        guard st.misses > 0 else { return 0 }
        return max(0, st.misses - Int((now - st.last) / 3600))
    }

    static func delay(_ misses: Int) -> Double {
        guard misses >= 5 else { return 0 }
        let steps: [Double] = [30, 60, 300, 900, 3600]
        return steps[min(misses - 5, steps.count - 1)]
    }

    static func secondsLeft() -> Int {
        let st = read()
        let now = Date().timeIntervalSince1970
        let left = st.last + delay(effective(st, now: now)) - now
        return left > 0 ? Int(left.rounded(.up)) : 0
    }

    static func record(opened: Bool) {
        guard !opened else { return }
        let now = Date().timeIntervalSince1970
        let st = read()
        write(State(misses: effective(st, now: now) + 1, last: now))
    }
}

// MARK: - Face ID

/// La clé d'enveloppe (KEK) d'UN coffre, rangée dans le trousseau derrière Face ID
/// (biométrie actuelle uniquement : pas de repli sur le code de l'iPhone, invalidée si les visages changent).
enum BioKey {
    private static let account = "bio-v1"
    private static let flag = "plq.bio"

    enum Load { case ok(Derived), cancelled, missing }

    static var enabled: Bool { UserDefaults.standard.bool(forKey: flag) }

    private static func base() -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword,
         kSecAttrService as String: K.service,
         kSecAttrAccount as String: account]
    }

    static func save(_ d: Derived) throws {
        delete()
        var err: Unmanaged<CFError>?
        guard let ac = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly,
                                                       .biometryCurrentSet, &err) else {
            throw VaultError.unavailable("Face ID est indisponible sur cet iPhone.")
        }
        let raw = d.kek.withUnsafeBytes { Data($0) }
        let payload = try JSONSerialization.data(withJSONObject: ["k": raw.base64EncodedString(), "v": d.vaultId])
        var q = base()
        q[kSecValueData as String] = payload
        q[kSecAttrAccessControl as String] = ac
        guard SecItemAdd(q as CFDictionary, nil) == errSecSuccess else {
            throw VaultError.unavailable("Active Face ID et un code sur ton iPhone pour utiliser cette option.")
        }
        UserDefaults.standard.set(true, forKey: flag)
    }

    /// Bloque pendant que Face ID s'affiche : à appeler hors du fil principal.
    static func load(reason: String) -> Load {
        let ctx = LAContext()
        ctx.localizedCancelTitle = "Combinaison"
        var q = base()
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        q[kSecUseAuthenticationContext as String] = ctx
        q[kSecUseOperationPrompt as String] = reason
        var out: CFTypeRef?
        let st = SecItemCopyMatching(q as CFDictionary, &out)
        if st == errSecItemNotFound {
            UserDefaults.standard.set(false, forKey: flag)
            return .missing
        }
        guard st == errSecSuccess, let d = out as? Data,
              let o = try? JSONSerialization.jsonObject(with: d) as? [String: String],
              let k = o["k"], let raw = Data(base64Encoded: k), raw.count == 32, let v = o["v"] else { return .cancelled }
        return .ok(Derived(kek: SymmetricKey(data: raw), vaultId: v))
    }

    static func delete() {
        SecItemDelete(base() as CFDictionary)
        UserDefaults.standard.set(false, forKey: flag)
    }
}

// MARK: - Plugin

extension VaultPlugin {

    @objc func bioStatus(_ call: CAPPluginCall) {
        let ctx = LAContext()
        var err: NSError?
        let ok = ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err)
        let kind: String
        switch ctx.biometryType {
        case .faceID: kind = "faceID"
        case .touchID: kind = "touchID"
        default: kind = "none"
        }
        call.resolve(["available": ok, "type": kind, "enabled": ok && BioKey.enabled])
    }

    /// Face ID ouvrira le coffre actuellement ouvert (et seulement lui).
    @objc func bioEnable(_ call: CAPPluginCall) {
        let ctx = LAContext()
        ctx.localizedCancelTitle = "Annuler"
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, error: &err) else {
            fail(call, VaultError.unavailable("Active Face ID dans les réglages de ton iPhone pour utiliser cette option."))
            return
        }
        ctx.evaluatePolicy(.deviceOwnerAuthenticationWithBiometrics, localizedReason: "Ouvrir ce coffre avec Face ID") { ok, _ in
            guard ok else { call.resolve(["enabled": false]); return }
            self.q.async {
                do {
                    let s = try self.requirePersisted()
                    try BioKey.save(Derived(kek: s.kek, vaultId: s.vaultId))
                    call.resolve(["enabled": true])
                } catch {
                    self.fail(call, error)
                }
            }
        }
    }

    @objc func bioDisable(_ call: CAPPluginCall) {
        BioKey.delete()
        call.resolve(["enabled": false])
    }

    @objc func bioUnlock(_ call: CAPPluginCall) {
        DispatchQueue.global(qos: .userInitiated).async {
            switch BioKey.load(reason: "Ouvrir Planque") {
            case .cancelled:
                call.resolve(["ok": false])
            case .missing:
                call.resolve(["ok": false, "reset": true])
            case .ok(let d):
                self.q.async {
                    self.wipeSession()
                    let s = VaultSession.open(d)
                    guard s.persisted else {
                        // coffre effacé ou combinaison changée depuis : on oublie cette clé
                        BioKey.delete()
                        call.resolve(["ok": false, "reset": true])
                        return
                    }
                    self.session = s
                    try? self.recordOpening(s)
                    var out = self.snapshot(s)
                    out["ok"] = true
                    call.resolve(out)
                }
            }
        }
    }

    // MARK: Carte-clé de secours

    /// Scanne une carte-clé Planque (QR « PLQR1. »).
    @objc func scanCard(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard AVCaptureDevice.default(for: .video) != nil else {
                self.fail(call, VaultError.unavailable("Appareil photo indisponible."))
                return
            }
            AVCaptureDevice.requestAccess(for: .video) { granted in
                DispatchQueue.main.async {
                    guard granted else { call.resolve(["text": "", "denied": true]); return }
                    guard let vc = self.bridge?.viewController else { call.resolve(["text": ""]); return }
                    let scanner = QRScannerController()
                    scanner.accept = { $0.range(of: "PLQR1\\.[A-Za-z0-9_-]{16,40}", options: .regularExpression) != nil }
                    scanner.hint = "Vise le QR code de ta carte-clé Planque."
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

    /// Imprimer ou ranger la carte-clé (image PNG fabriquée par l'interface). Pas d'enregistrement dans Photos.
    @objc func saveCard(_ call: CAPPluginCall) {
        guard let b64 = call.getString("png"), let png = Data(base64Encoded: b64), png.count < 8_000_000 else {
            fail(call, VaultError.corrupted)
            return
        }
        q.async {
            do {
                let dir = Paths.scratch.appendingPathComponent(UUID().uuidString, isDirectory: true)
                try Paths.ensure(dir)
                let url = dir.appendingPathComponent("Carte-cle-Planque.png")
                try writeProtected(png, to: url)
                DispatchQueue.main.async {
                    guard let vc = self.bridge?.viewController else { return }
                    let sheet = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                    sheet.excludedActivityTypes = [.saveToCameraRoll, .postToFacebook, .postToTwitter, .assignToContact]
                    sheet.completionWithItemsHandler = { [weak self] type, completed, _, _ in
                        self?.q.asyncAfter(deadline: .now() + 5) { try? FileManager.default.removeItem(at: dir) }
                        self?.endUI(call, ["done": completed, "via": type?.rawValue ?? ""])
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
}
