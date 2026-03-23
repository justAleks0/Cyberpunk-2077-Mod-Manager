local HiddenMods = {}

local hiddenPath = "hiddenMods.json"
local hiddenIds = {}

function HiddenMods.load()
    local file = io.open(hiddenPath, "r")
    if file then
        local content = file:read("*all")
        file:close()
        local ok, data = pcall(json.decode, content)
        if ok and data and data.hiddenIds then
            hiddenIds = data.hiddenIds
        end
    end
end

function HiddenMods.save()
    local data = {
        version = 1,
        hiddenIds = hiddenIds,
    }
    local ok, encoded = pcall(json.encode, data)
    if ok then
        local file = io.open(hiddenPath, "w")
        if file then
            file:write(encoded)
            file:close()
        end
    end
end

function HiddenMods.toggle(modId)
    if HiddenMods.isHidden(modId) then
        local newIds = {}
        for _, id in ipairs(hiddenIds) do
            if id ~= modId then
                table.insert(newIds, id)
            end
        end
        hiddenIds = newIds
    else
        table.insert(hiddenIds, modId)
    end
    HiddenMods.save()
end

function HiddenMods.isHidden(modId)
    for _, id in ipairs(hiddenIds) do
        if id == modId then return true end
    end
    return false
end

function HiddenMods.getCount()
    return #hiddenIds
end

return HiddenMods
