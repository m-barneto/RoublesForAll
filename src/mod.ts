import { DependencyContainer } from "tsyringe";

import { IPostDBLoadMod } from "@spt-aki/models/external/IPostDBLoadMod";
import { ILogger } from "@spt-aki/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt-aki/servers/DatabaseServer";
import { LogTextColor } from "@spt-aki/models/spt/logging/LogTextColor";
import { ITrader } from "@spt-aki/models/eft/common/tables/ITrader";

class RoublesForAll implements IPostDBLoadMod
{
    private modConfig = require("../config/config.json");
    private logger: ILogger;

    public postDBLoad(container: DependencyContainer): void {
        const databaseServer = container.resolve<DatabaseServer>("DatabaseServer");
        this.logger = container.resolve<ILogger>("WinstonLogger");

        const traderTable = databaseServer.getTables().traders;

        // Iterate over all traders
        for (const traderId in traderTable)
        {
            const trader = traderTable[traderId];
            const nickname = trader.base.nickname;
            // Unknown and caretaker are excluded
            if (nickname === "caretaker" || nickname === "Unknown") continue;
            
            this.updateTrader(traderId, traderTable);
        }
    }

    private getConversionRate(fromCurrency, targetCurrency)
    {
        if (fromCurrency == targetCurrency) return 1.0;

        if (fromCurrency == "EUR")
        {
            if (targetCurrency == "USD")
            {
                // euro to rouble first, then to usd
                return this.getConversionRate(fromCurrency, "RUB") * this.modConfig.dollarExchangeRate;
            }
            else if (targetCurrency == "RUB")
            {
                return this.modConfig.euroExchangeRate;
            }
        }
        if (fromCurrency == "USD")
        {
            if (targetCurrency == "EUR")
            {
                return this.getConversionRate(fromCurrency, "RUB") * this.modConfig.euroExchangeRate;
            }
            else if (targetCurrency == "RUB")
            {
                return this.modConfig.dollarExchangeRate;
            }
        }
        if (fromCurrency == "RUB")
        {
            if (targetCurrency == "EUR")
            {
                return 1.0 / this.modConfig.euroExchangeRate;
            }
            else if (targetCurrency == "USD")
            {
                return 1.0 / this.modConfig.dollarExchangeRate;
            }
        }
        
        
        this.logger.log(`[RoublesForAll] Failed to convert from ${fromCurrency} to ${targetCurrency}.`, LogTextColor.RED);
        return 1.0;
    }

    private getCurrencyId(currency)
    {
        switch (currency)
        {
            case "RUB":
                return this.modConfig.roubles;
            case "EUR":
                return this.modConfig.euros;
            case "USD":
                return this.modConfig.dollars;
        }
        this.logger.log(`[RoublesForAll] Failed to get id from currency name ${currency}.`, LogTextColor.RED);
        return null;
    }

    private getCurrencyName(currencyId)
    {
        switch (currencyId)
        {
            case this.modConfig.roubles:
                return "RUB";
            case this.modConfig.euros:
                return "EUR";
            case this.modConfig.dollars:
                return "USD";
        }
        return null;
    }

    private updateTrader(traderId: string, traderTable: Record<string, ITrader>) 
    {
        const trader = traderTable[traderId];
        
        // Handle loyalty level requirements
        if (trader.base.currency != this.modConfig.targetCurrency)
        {
            const exchangeRate = this.getConversionRate(trader.base.currency, this.modConfig.targetCurrency)
            // Modify trader loyalty levels to reflect their new currency
            for (const loyaltyLevelId in trader.base.loyaltyLevels)
            {
                trader.base.loyaltyLevels[loyaltyLevelId].minSalesSum *= exchangeRate;
            }

            // Set trader to use target currency
            trader.base.currency = this.modConfig.targetCurrency;
        }

        // Convert trader stock to target currency
        let itemsConverted = 0;
        const targetCurrencyId = this.getCurrencyId(this.modConfig.targetCurrency);
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
                // If it's price is not our targetCurrency
                if (this.getCurrencyName(item._tpl) !== null)
                {
                    // Change it's count (price) to reflect the exchange rate
                    const exchangeRate = this.getConversionRate(this.getCurrencyName(item._tpl), this.modConfig.targetCurrency);
                    item.count *= exchangeRate;

                    // Change the cost currency to our target currency id
                    item._tpl = targetCurrencyId;

                    // Add to our count
                    itemsConverted += 1;
                }
            }
        }
        this.logger.log(`[RoublesForAll] ${trader.base.nickname}: ${itemsConverted} items converted to take ${this.modConfig.targetCurrency}.`, LogTextColor.WHITE);
    }
}

module.exports = { mod: new RoublesForAll() };
