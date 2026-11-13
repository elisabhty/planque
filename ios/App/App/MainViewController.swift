import UIKit
import Capacitor

/// Contrôleur principal : enregistre le plugin natif du coffre (chiffrement, import, aperçus).
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(VaultPlugin())
    }
}
