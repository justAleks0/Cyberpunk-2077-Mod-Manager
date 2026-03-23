-- Dummy Mod so CET doesn't complain
mod = {
    ready = false
}

registerForEvent("onInit", function()
    mod.ready = true
end)

return mod