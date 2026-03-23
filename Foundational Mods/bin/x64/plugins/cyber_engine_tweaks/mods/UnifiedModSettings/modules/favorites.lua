local Favorites = {}

local favoritesPath = "favorites.json"
local favoriteModIds = {}

function Favorites.init(ums)
    Favorites.load()
end

function Favorites.load()
    local file = io.open(favoritesPath, "r")
    if file then
        local content = file:read("*all")
        file:close()
        local ok, data = pcall(json.decode, content)
        if ok and data and data.favoriteModIds then
            favoriteModIds = data.favoriteModIds
        end
    end
end

function Favorites.save()
    local data = {
        version = 2,
        favoriteModIds = favoriteModIds,
    }
    local ok, encoded = pcall(json.encode, data)
    if ok then
        local file = io.open(favoritesPath, "w")
        if file then
            file:write(encoded)
            file:close()
        end
    end
end

function Favorites.applyFavorites(mods)
    local idSet = {}
    for _, id in ipairs(favoriteModIds) do
        idSet[id] = true
    end

    for modId, mod in pairs(mods) do
        mod.isFavorite = idSet[modId] or false
    end
end

function Favorites.toggleMod(modId)
    if Favorites.isModFavorite(modId) then
        local newIds = {}
        for _, id in ipairs(favoriteModIds) do
            if id ~= modId then
                table.insert(newIds, id)
            end
        end
        favoriteModIds = newIds
    else
        table.insert(favoriteModIds, modId)
    end
    Favorites.save()
end

function Favorites.isModFavorite(modId)
    for _, id in ipairs(favoriteModIds) do
        if id == modId then return true end
    end
    return false
end

return Favorites
