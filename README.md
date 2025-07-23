# Hot Tab

Hot Tab is a Chrome extension to help you keep tab of your tabs.

## Which problem does Hot Tab address?

When you work a lot in Chrome, you may find yourself in a situation where you continuously open tabs and need to jump back and forth between them.
Maybe because you're doing research for a document, reading various web pages and taking notes intermittently.
Or maybe you're collaborating on a chat and sift through links.

If that sounds familiar to you, you might also know how tedious it can be to even just find the right tab when you have amassed a greater number of tabs, maybe even windows, maybe even separated on different desktops.
Hot Tab tries to make that switching easier.

## How does Hot Tab attempt to solve that problem?

Hot Tab lets you pin your open tabs and associate them with a key on your keyboard.

Now if you need to get to a previously pinned tab, it's just a shortcut plus a press of the associated key away.

## Usage

* On `chrome://extensions/shortcuts`, pick a shortcut to activate the extension. This will be the key combination you'll have to press everytime you'd like to pin or retrieve a tab.

* I also recommend you pin the extension in your Chrome. That will make the Hot Tab popup appear more quickly and allow for a quicker workflow.

### Direct Controls

The following controls are supposed to be simple and quick.
To start interacting with Hot Tab, press `<shortcut>`, so the extension popup appears.
Then you can do any of the following actions:

* If you'd like to pin a tab, press `<Ctrl>` + `<key>`.

* If you'd like to go back to a previously pinned tab, press `<key>`.

* If you'd like to move a previously pinned tab to the current window and make it the active tab, then press `<Shift>` + `<key>`.

* To remove a pin press `<Alt>` + `<key>`.

* There are ten so-called keysets, each of which is associated with a number and each of which you can associate keys with different pins. Pressing any number key will activate the respective keyset.

### Command Combos

Command combos are require a sequence of keys to trigger an action. They are taking a bit more getting used to but are also more powerful.
As with the direct controls, you first need to press `<shortcut>` to bring up the popup window.
Pressing `<Space>` will then initiate a new command combo.
Then, you can do any following combo:

* `p[<keyset>]<key>`: Pin the current tab under the given key. The pin's URL pattern will be set to the tab URL's origin (i.e., `protocol://host/*`), so that when the pin becomes detached from its tab, it will bind to any other tab under the same host.
* `P[<keyset>]<key>`: Pin the current tab under the given key. The pin's URL pattern will be set to the tab URL's origin and path (i.e., `protocol://host/some/path`), so that when the pin becomes detached from its tab, it will bind only to tabs at the very same host and path.
* `g[<keyset>]<key>`: Go the pinned tab.
* `G[<keyset>]<key>`: Bring the pinned tab to the current window and make it the active tab.
* `f[<keyset>]<key>`: Create a new tab based on key's the pin.
* `r[<keyset>]<key>`: Go to the pinned tab and reset it, i.e., navigate to the pinned URL.
* `m[<keyset>]<key>[<keyset>]<key>`: Move the pin from the first to the second specified key.
* `d[<keyset>]<key>`: Remove the pin.
* `D<keyset>`: Clear the specified keyset.
* `DD`: Clear the current keyset.
* `e`: Open the side panel for edits.
* `q`: Close the popup.
