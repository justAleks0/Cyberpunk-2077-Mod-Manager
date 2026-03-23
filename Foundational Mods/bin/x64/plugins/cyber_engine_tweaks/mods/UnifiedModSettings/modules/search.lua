local Search = {}

function Search.filter(unifiedData, query)
    if not query or query == "" then return nil end

    local queryLower = string.lower(query)
    local results = {}

    for _, modId in ipairs(unifiedData.sortedModIds) do
        local mod = unifiedData.mods[modId]
        local matchingOptions = {}

        local modNameMatches = string.find(string.lower(mod.displayName), queryLower, 1, true)

        local totalOptions = 0
        for _, catId in ipairs(mod.categoryOrder) do
            local cat = mod.categories[catId]
            if cat then
                for _, option in ipairs(cat.options) do
                    totalOptions = totalOptions + 1
                    local labelMatch = string.find(string.lower(option.label), queryLower, 1, true)
                    local descMatch = option.description and
                        string.find(string.lower(option.description), queryLower, 1, true)

                    if modNameMatches or labelMatch or descMatch then
                        table.insert(matchingOptions, option)
                    end
                end
            end
        end

        if #matchingOptions > 0 then
            table.insert(results, {
                mod = mod,
                options = matchingOptions,
            })
        end
    end

    return results
end

return Search
