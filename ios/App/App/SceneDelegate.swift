import UIKit
import CloudKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = MainViewController()
        window?.makeKeyAndVisible()

        // Appli lancée en touchant une invitation iCloud ou un lien de clé de coffre partagé
        if let metadata = connectionOptions.cloudKitShareMetadata {
            SharedHub.receive(invite: metadata)
        }
        for context in connectionOptions.urlContexts {
            SharedHub.receive(url: context.url)
        }

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        for context in URLContexts {
            SharedHub.receive(url: context.url)
        }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }

    /// Invitation à un coffre partagé (lien iCloud reçu par Messages ou Mail) : traitée après ouverture d'un coffre.
    func windowScene(_ windowScene: UIWindowScene, userDidAcceptCloudKitShareWith cloudKitShareMetadata: CKShare.Metadata) {
        SharedHub.receive(invite: cloudKitShareMetadata)
    }
}
