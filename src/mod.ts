import { DependencyContainer } from "tsyringe";

import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LogTextColor } from "@spt-aki/models/spt/logging/LogTextColor";

class Mod implements IPostDBLoadMod
{
    private modConfig = require("../config/config.json");

    public postDBLoad(container: DependencyContainer): void {
        // Database will be loaded, this is the fresh state of the DB so NOTHING from the AKI
        // logic has modified anything yet. This is the DB loaded straight from the JSON files
        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        const logger = container.resolve<ILogger>("WinstonLogger");

        const traderTable = databaseServer.getTables().traders;

        // Iterate over all traders
        for (const traderId in traderTable)
        {
            let itemsConverted = 0;
            const trader = traderTable[traderId];
            const nickname = trader.base.nickname;

            // Unknown and caretaker are excluded
            if (nickname === "caretaker" || nickname === "Unknown") continue;

            // Get the exchange rate for the trader's currency, RUB = 1
            let exchangeRate = 1;
            switch (trader.base.currency)
            {
                case "USD": {
                    exchangeRate = this.modConfig.dollarExchangeRate;
                    break;
                }
                case "EUR": {
                    exchangeRate = this.modConfig.euroExchangeRate;
                }
            }
            
            // Modify trader loyalty levels to reflect their new currency
            for (const loyaltyLevelId in trader.base.loyaltyLevels)
            {
                trader.base.loyaltyLevels[loyaltyLevelId].minSalesSum *= exchangeRate;
            }

            // Set trader to use roubles
            trader.base.currency = "RUB";

            // Get the trader's stock
            const barters = trader.assort.barter_scheme;
            for (const barterId in barters)
            {
                // Get the barterInfo for the trade
                const barterInfo = barters[barterId];
                for (const barterInfoId in barterInfo)
                {
                    // Get the trade in items for the barter
                    const barterEntrys = barterInfo[barterInfoId];

                    // If it's a barter that takes in multiple items then continue, normal items for sale will only have one entry, the currency cost
                    if (barterEntrys.length > 1) continue;

                    // Get the cost
                    const item = barterEntrys[0];
                    // If it's price is in dollars or euros
                    if (item._tpl === this.modConfig.dollars || item._tpl === this.modConfig.euros)
                    {
                        // Change it's count (price) to reflect the exchange rate
                        switch (item._tpl)
                        {
                            case this.modConfig.dollars: {
                                item.count *= this.modConfig.dollarExchangeRate;
                                break;
                            }
                            case this.modConfig.euros: {
                                item.count *= this.modConfig.euroExchangeRate;
                                break;
                            }
                        }

                        // Change the cost currency to roubles
                        item._tpl = this.modConfig.roubles;

                        // Add to our count
                        itemsConverted += 1;
                    }
                }
            }

            logger.log(`[RoublesForAll] ${nickname}: ${itemsConverted} items converted to take roubles.`, LogTextColor.WHITE);
        }
    }
}

module.exports = { mod: new Mod() };
