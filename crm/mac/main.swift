// CRM NomoTax para Mac: ventana propia con https://crm.nomotax.io dentro (WebKit).
// Compilar e instalar: zsh crm/mac/instalar.sh
import Cocoa
import WebKit

let URL_CRM = URL(string: "https://crm.nomotax.io")!

final class App: NSObject, NSApplicationDelegate, WKUIDelegate, WKNavigationDelegate, NSWindowDelegate {
    var ventana: NSWindow!
    var web: WKWebView!

    func applicationDidFinishLaunching(_ n: Notification) {
        let conf = WKWebViewConfiguration()
        conf.websiteDataStore = .default() // la sesión se guarda entre aperturas
        conf.preferences.javaScriptCanOpenWindowsAutomatically = true
        web = WKWebView(frame: .zero, configuration: conf)
        web.uiDelegate = self
        web.navigationDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.customUserAgent = nil

        ventana = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
                           styleMask: [.titled, .closable, .miniaturizable, .resizable],
                           backing: .buffered, defer: false)
        ventana.title = "CRM NomoTax"
        ventana.contentView = web
        ventana.setFrameAutosaveName("CRMNomoTax")
        if !ventana.setFrameUsingName("CRMNomoTax") { ventana.center() }
        ventana.delegate = self
        ventana.makeKeyAndOrderFront(nil)
        web.load(URLRequest(url: URL_CRM))
        menu()
        NSApp.activate(ignoringOtherApps: true)
    }

    // Cerrar la ventana no cierra la app; el icono del Dock la vuelve a mostrar
    func applicationShouldHandleReopen(_ s: NSApplication, hasVisibleWindows v: Bool) -> Bool {
        if !v { ventana.makeKeyAndOrderFront(nil) }
        return true
    }

    // Micrófono para el dictado: permitido siempre para el CRM
    func webView(_ w: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame f: WKFrameInfo,
                 type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        decisionHandler(origin.host.hasSuffix("nomotax.io") || origin.host == "localhost" ? .grant : .prompt)
    }

    // «Subir» documentos
    func webView(_ w: WKWebView, runOpenPanelWith p: WKOpenPanelParameters, initiatedByFrame f: WKFrameInfo,
                 completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = p.allowsMultipleSelection
        panel.canChooseDirectories = false
        panel.beginSheetModal(for: ventana) { r in completionHandler(r == .OK ? panel.urls : nil) }
    }

    // window.open (abrir documentos): en el navegador por defecto
    func webView(_ w: WKWebView, createWebViewWith c: WKWebViewConfiguration, for a: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let u = a.request.url, u.scheme == "https" || u.scheme == "http" { NSWorkspace.shared.open(u) }
        return nil
    }

    // Enlaces a otras webs: fuera, en el navegador
    func webView(_ w: WKWebView, decidePolicyFor a: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        if let u = a.request.url, a.navigationType == .linkActivated, let h = u.host, !h.hasSuffix("nomotax.io") {
            NSWorkspace.shared.open(u); decisionHandler(.cancel); return
        }
        decisionHandler(.allow)
    }

    // confirm() / alert() de la web
    func webView(_ w: WKWebView, runJavaScriptConfirmPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo,
                 completionHandler: @escaping (Bool) -> Void) {
        let a = NSAlert(); a.messageText = m; a.addButton(withTitle: "Aceptar"); a.addButton(withTitle: "Cancelar")
        completionHandler(a.runModal() == .alertFirstButtonReturn)
    }
    func webView(_ w: WKWebView, runJavaScriptAlertPanelWithMessage m: String, initiatedByFrame f: WKFrameInfo,
                 completionHandler: @escaping () -> Void) {
        let a = NSAlert(); a.messageText = m; a.runModal(); completionHandler()
    }

    @objc func recargar() { web.reload() }

    func menu() {
        let barra = NSMenu()
        let app = NSMenuItem(); barra.addItem(app)
        let m = NSMenu()
        m.addItem(withTitle: "Ocultar CRM NomoTax", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        m.addItem(withTitle: "Recargar", action: #selector(recargar), keyEquivalent: "r")
        m.addItem(.separator())
        m.addItem(withTitle: "Salir de CRM NomoTax", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        app.submenu = m
        // Edición: copiar/pegar/deshacer en los campos de texto
        let ed = NSMenuItem(); barra.addItem(ed)
        let e = NSMenu(title: "Edición")
        e.addItem(withTitle: "Deshacer", action: Selector(("undo:")), keyEquivalent: "z")
        e.addItem(withTitle: "Rehacer", action: Selector(("redo:")), keyEquivalent: "Z")
        e.addItem(.separator())
        e.addItem(withTitle: "Cortar", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        e.addItem(withTitle: "Copiar", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        e.addItem(withTitle: "Pegar", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        e.addItem(withTitle: "Seleccionar todo", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        ed.submenu = e
        let ve = NSMenuItem(); barra.addItem(ve)
        let v = NSMenu(title: "Ventana")
        v.addItem(withTitle: "Minimizar", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        v.addItem(withTitle: "Cerrar", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        ve.submenu = v
        NSApp.mainMenu = barra
    }
}

let app = NSApplication.shared
let delegado = App()
app.delegate = delegado
app.setActivationPolicy(.regular)
app.run()
