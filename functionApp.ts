import { CosmosClient } from "@azure/cosmos";
import * as azure from "@pulumi/azure";
import { GlobalContext, RegionalContext } from "./globalApp";

export function buildFunctionApp({ resourceGroup, cosmosdb, opts }: GlobalContext) {
    const database = new azure.cosmosdb.SqlDatabase("functions-db", {
        resourceGroupName: resourceGroup.name,
        accountName: cosmosdb.name,
    }, opts);

    const collection = new azure.cosmosdb.SqlContainer("functions-items", {
        resourceGroupName: resourceGroup.name,
        accountName: cosmosdb.name,
        databaseName: database.name,
    }, opts);

    return ({ location }: RegionalContext) => {
        const fn = new azure.appservice.HttpEventSubscription(`GetUrl-${location}`, {
            resourceGroup,
            location,
            route: "{key}",
            hostSettings: {
                extensions: {
                    http: {
                        routePrefix: "",
                    },
                },
            },
            callbackFactory: () => {
                const client = new CosmosClient({
                    endpoint: cosmosdb.endpoint.get(),
                    key: cosmosdb.primaryMasterKey.get(),
                    connectionPolicy: { preferredLocations: [location] },
                });
                const container = client.database(database.name.get()).container(collection.name.get());

                return async (_, request: azure.appservice.HttpRequest) => {
                    const key = request.params.key;
                    if (key === "ping") {
                        // Handle traffic manager live pings
                        return { status: 200, body: "Ping ACK" };
                    }

                    try {
                        const response = await container.item(key, undefined).read();

                        return response.resource
                            ? { status: 200, body: response.resource }
                            : { status: 404, body: "" };
                    } catch (e) {
                        // Cosmos SDK throws an error for non-existing documents
                        return { status: 404, body: e };
                    }
                };
            },
        }, opts);

        return {
            id: fn.functionApp.id,
        };
    };
}
