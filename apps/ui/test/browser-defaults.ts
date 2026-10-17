// Happy DOM leaves the initial animation name empty. Match browsers so Kobalte's
// presence tracking can finish unmounting non-animated popups.
const defaults = document.createElement("style")
defaults.textContent = "* { animation-name: none; }"
document.head.append(defaults)
