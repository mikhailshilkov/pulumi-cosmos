import { Container } from "@azure/cosmos";
import * as azure from "@pulumi/azure";
import { getContainer } from "./cosmosclient";
import { GlobalContext, RegionalContext } from "./globalApp";

export function buildFunctionApp({ resourceGroup, cosmosdb, opts }: GlobalContext) {
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
                const endpoint = cosmosdb.endpoint.get();
                const masterKey = cosmosdb.primaryMasterKey.get();

                let container: Container;
                return async (_, request: azure.appservice.HttpRequest) => {
                    container = container || await getContainer(endpoint, masterKey, location);

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
                        return { status: 404, body: "" };
                    }
                };
            },
        }, opts);

        return {
            id: fn.functionApp.id,
        };
    };
}
