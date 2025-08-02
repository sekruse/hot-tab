# Hot Tab

Hot Tab is a Chrome extension to help you keep tabs on your tabs.

## Which problem does Hot Tab address?

When you work a lot in Chrome, you may find yourself in a situation where you need to handle a large number of tabs and need to jump back and forth in between them. Maybe because you're doing research for a document, reading various web pages and taking notes intermittently. Or maybe you're collaborating on a chat while coding in a different tab with yet another tab for some API documentation.

This switching back and forth can feel tedious and distracting on its own. But it gets worse when you have very many open tabs and need to start searching the right tab all the time. Or even worse, the tabs are in different Chrome windows, possibly on different workspaces. 

Hot Tab is a tool to help you navigate your tabs more easily for fewer distractions and higher productivity.

## How does Hot Tab help?

In a nutshell, Hot Tab lets you _pin_ your open tabs with a few keystrokes. Afterwards, you can get back to your pinned tabs again by means of just a few keystrokes.

Hot Tab is flexible and you can customize it to what works best for you. However, you might want to start with Quick Start instructions below, which offer a simple setup, and see what works for you and what doesn't. If you'd like to dive deeper, you'll find more comprehensive infos in the Reference section.

## Quick Start

1. Download the source code from this repository. You can then [install it as an unpacked Chrome extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

1. (Optional.) Navigate to `chrome://extensions`, find the card for "Hot Tab", click "Details", and then select "Pin to toolbar". While not necessary, it'll make for a better experience as the extension popup window can appear more quickly.

1. In Chrome, navigate to `chrome://extensions/shortcuts`, scroll to the section for Hot Tab, and set the following shortkeys:

   | Command | Key combination |
   | --- | --- |
   | Activate the extension | `Alt`+`T` (`⌥T` on macOS) |
   | Command slot 01 | `Alt`+`A` (`⌥A` on macOS) |
   | Command slot 02 | `Alt`+`S` (`⌥S` on macOS) |
   | Command slot 03 | `Alt`+`D` (`⌥D` on macOS) |
   | Command slot 04 | `Alt`+`F` (`⌥F` on macOS) |

   The first shortcut brings up the Hot Tab popup window, from where you can pin tabs and go to tabs. The other shortcuts trigger actions, which we'll configure in the next step.

1. Click on the puzzle piece in the top right of a Chrome window, click the three dots next to the Hot Tab extension, and then click "Options". A new tab will open. In it, you should see the four command slot shortcuts with text fields next to them. Type in `ga`, `gs`, `gd`, and `gf` in those text fields if they don't already say so.These text fields program the action to be executed when the respective shortcut is pressed. For example, `ga` means: Go to the tab that's pinned at the key `A`. What that means will become clear as you follow through the next steps.

1. Your Hot Tab is now configured and ready to use. Let's first familiarize with it. In Chrome, press `Alt`+`T` (`⌥T` on macOS) to bring up the Hot Tab popup window. On it, you'll see a keyboard with lots of blank keys. Each of those blank keys serves as a register under which you can store (and later retrieve) a pin for a tab.

1. Let's pin a tab. Open a new tab and navigate to https://www.random.org/ or some other random page. Press `Alt`+`T` (`⌥T` on macOS) to bring up the Hot Tab popup window and then press `Ctrl`+`A` (`⌃A` on macOS) to store a pin to the tab under the key `A`. If you press `Alt`+`T` (`⌥T` on macOS) again, you should now see the logo (the favicon, to be precise) of the pinned web page at the location of the key `A`.

1. Let's now jump between tabs. Open yet another tab and navigate to a page of your choice. To get back to our previously pinned tab, simply press `Alt`+`T` (`⌥T` on macOS) to bring up the Hot Tab popup window and then press `A` to get to the tab that's pinned under the key `A`. Press `Alt`+`T` (`⌥T` on macOS) again, followed by `Backspace` (`⌫` on macOS) to get back to the new tab.

1. Let's finally test the shortcuts. Go to a tab other than the one pinned under the key `A`. Press `Alt`+`T` (`⌥T` on macOS) followed by `Ctrl`+`S` (`⌃S` on macOS) to pin this other tab under the key `S`. Now press `Alt`+`A` and `Alt`+`S` (`⌥A` and `⌥S` on macOS) to quickly jump between the two tabs _without_ having to open the popup using `Alt`+`T` / ` ⌥T`.

1. Finally, press `Alt`+`T` (`⌥T` on macOS) followed by `Alt`+`A` and `Alt`+`S` (`⌥A` and `⌥S` on macOS) to remove the two pins from the above instructions and return to a clean slate.

1. At this point, you're all set with the basics. You can just use Hot Tab in its current configuration. Or, if you want, there are advanced topics to explore, such as utilizing multiple layers and leveraging the command syntax for advanced operations. If you're interested, keep reading.

## Layers

As explained above, pins to tabs are stored under a key on your keyboard. That is actually a simplification: Hot Tab provides multiple keyboard **layers** and in each such layer, you can associate a key on your keyboard with a different pin. The point of these layers is to provide more space for pins and let users group related pins while separating unrelated pins.

Each layer is identified by a number between 0 and 9. To switch between layers, open the popup window and press the keys `1` through `0` in the number row. The currently selected layer will be indicated by an accentuated number row key.

The layer 0 plays a special role and is called the **global layer**. It is applied as an overlay to all other layers. In other words, pins from the global layer will also be present in all other layers, even if those other layers have a pin for the very same key. In that case, the pin from the global layer overrides the pin from the normal layer. The point of the global layer is to provide access to pins that are useful in many contexts (e.g., a chat or task tracker) without having the user switch back and forth between layers.

## Command Combos

Command combos are a sequence of key presses that trigger an action. Hot Tab uses them in the following two contexts:

* To program shortcut command slots as has been explained in the quick start section.
* To trigger to advanced operations in the popup window. Open the popup window and press `Space` to initiate a new command combo.

The table below lists all supported command combos. Squared brackets (`[...]`) denote optional commands; `<layer>` is a placeholder for a layer key (`1` through `0`); and `<key>` is a placeholder for any key that can store a pin, in particular all the letters and a few special characters. As an example, for the `g[<layer>]<key>` command, `ga` will be a valid command combo ("go to the pin at key `A` in the current layer") and `g2a` will also be a valid command combo ("go to thie pin at key `A` in layer `2`").

| Command | Description | Notes |
| --- | --- | --- |
| `p[<layer>]<key>` | Pin the current tab under the given key. The pin's URL pattern will be set to the tab URL's origin (i.e., `protocol://host/*`), so that when the pin becomes detached from its tab, it will bind to any other tab under the same host. | This is the same as `Ctrl`+`<key>` (`⌃<key>` on macOS) in the popup window. |
| `P[<layer>]<key>` | Pin the current tab under the given key. The pin's URL pattern will be set to the tab URL's origin and path (i.e., `protocol://host/some/path`), so that when the pin becomes detached from its tab, it will bind only to tabs at the very same host and path. | |
| `z` | Highlight the key with the currently pinned tab. | Only in the popup window, not for programmable shortcuts. |
| `g[<layer>]<key>` | Go the pinned tab. | This is the same as pressing only `<key>` in the popup window. |
| `G[<layer>]<key>` | Bring the pinned tab to the current window and make it the active tab. | This is the same as `Shift`+`<key>` (`⇧<key>` on macOS) in the popup window. |
| `f[<layer>]<key>` | Create a new tab with the pinned URL. | |
| `r[<layer>]<key>` | Go to the pinned tab and reset it, i.e., navigate to the pinned URL. | |
| `x[<layer>]<key>` | Close the pinned tab. | |
| `X<layer>` | Close all pinned tabs from the layer. | |
| `XX` | Close all pinned tabs from the current layer. | |
| `y<layer>` | Close all tabs that are not pinned in the specified and global layer. | |
| `yy` | Close all tabs that are not pinned in the current and global layer. | |
| `ya` | Close all tabs that are not pinned in any layer. | |
| `m[<layer>]<key>[<layer>]<key>` | Swap the pins from the first and the second specified key. | In the UI, you should either leave out both `<layer>` args or add both to work around a known bug. |
| `M[<layer>]<key>[<layer>]<key>` | Move the pin from the first to the second specified key. | In the UI, you should either leave out both `<layer>` args or add both to work around a known bug. |
| `d[<layer>]<key>` | Remove the pin. | This is the same as `Alt`+`<key>` (`⌥<key>` on macOS) in the popup window. |
| `D<layer>` | Clear the specified layer. | |
| `DD` | Clear the current layer. | |
| `k<layer>` | Change the currently selected layer. | |
| `e` | Open the side panel for edits. | Only in the popup window, not for programmable shortcuts. |
| `q` | Close the popup. | Only in the popup window, not for programmable shortcuts. |

## Pins Throughout the Tab Lifecycle

Pins cannot only provide quick access to open tabs, but they can also be useful after a pinned tab has been closed. To understand how this in more detail, it's important to know that a pin has three properties:

* The ID of the pinned tab. If the tab is closed, the ID is deleted from the pin and the pin becomes _detached_.
* A URL pattern to rebind the pin later. This URL pattern can differ in specificity based on the concrete command used to first create the pin.
* A URL. This is typically the URL of the tab when it was first pinned.

Now when you request the tab for a pin, the following simple steps determine what will happen:

* If the pinned tab exists, that's your tab.
* If the tab is detached, find any other tab whose URL matches the pin's URL pattern. If there is such a tab, that's your tab. The pin is attached to the tab, so you'll get that same tab next time you fetch the pin – even if the tab is no longer matching the pin's URL pattern at that point.
* However, if there's no matching tab for the detached pin, a new tab will be created with the pin's URL. The pin is attached to the new tab.

Long story short, the above steps are designed so that in most cases you will get you a useful tab when selecting a pin while avoiding to create duplicate pins – Hot Tab should help manage the tab chaos, not add to it. However, for this to work, it's important to set your pins' URLs and URL patterns properly (cf. `p` vs. `P` command). For long-lived pins (e.g., those on the global layer), you might want to edit the URLs and URL patterns manually (cf. `e` command), so that the pins properly reattach to their designated tabs after, e.g., a browser restart.
