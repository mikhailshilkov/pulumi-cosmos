import * as azure from "@pulumi/azure";
import * as pulumi from "@pulumi/pulumi";
import { ResourceOptions } from "@pulumi/pulumi";

export interface GlobalContext {
    resourceGroup: azure.core.ResourceGroup;
    cosmosdb: azure.cosmosdb.Account;
    opts: ResourceOptions;
}

export interface RegionalContext {
    location: string;
}

export interface RegionalEndpoint {
    // Azure resource ID (App Service and Public IP are supported)
    id?: pulumi.Input<string>;
    // An arbitrary URL for other resource types
    url?: pulumi.Input<string>;
}

type BuildLocation = (context: RegionalContext) => RegionalEndpoint;
type BuildLocationFactory = (context: GlobalContext) => BuildLocation;

export interface GlobalAppArgs {
    resourceGroup: azure.core.ResourceGroup;
    locations: pulumi.Input<pulumi.Input<string>[]>;
    factory: BuildLocationFactory;
    enableMultiMaster?: boolean;
}

export class GlobalApp extends pulumi.ComponentResource {
    public endpoint: pulumi.Output<string>;

    constructor(name: string,
                args: GlobalAppArgs,
                opts: pulumi.ComponentResourceOptions = {}) {
        super("examples:global:GlobalApp", name, args, opts);

        const resourceGroup = args.resourceGroup;
        const locations = pulumi.output(args.locations);
        const primaryLocation = locations[0];
        const parentOpts = { parent: this, ...opts };

        // Cosmos DB with a single write region (primary location) and multiple read replicas
        const cosmosdb = new azure.cosmosdb.Account(`cosmos-${name}`, {
            resourceGroupName: resourceGroup.name,
            location: primaryLocation,
            geoLocations: locations.apply(ls => ls.map((location, failoverPriority) => ({ location, failoverPriority }))),
            offerType: "Standard",
            consistencyPolicy: {
                consistencyLevel: "Session",
                maxIntervalInSeconds: 5,
                maxStalenessPrefix: 100,
            },
            enableMultipleWriteLocations: args.enableMultiMaster,
        }, parentOpts);

        // Traffic Manager as a global HTTP endpoint
        const profile = new azure.trafficmanager.Profile(`tm${name}`, {
            resourceGroupName: resourceGroup.name,
            trafficRoutingMethod: "Performance",
            dnsConfigs: [{
                // Subdomain must be globally unique, so we default it with the full resource group name
                relativeName: pulumi.interpolate`${name}${resourceGroup.name}`,
                ttl: 60,
            }],
            monitorConfigs: [{
                protocol: "HTTP",
                port: 80,
                path: "/api/ping",
            }],
        }, parentOpts);

        const buildLocation = args.factory({ resourceGroup, cosmosdb, opts: parentOpts });

        const endpoints = locations.apply(ls => ls.map(location => {
            const app = buildLocation({ location });

            // An endpoint per region for Traffic Manager, link to the corresponding Function App
            return new azure.trafficmanager.Endpoint(`tm${name}${location}`.substring(0, 16), {
                resourceGroupName: resourceGroup.name,
                profileName: profile.name,
                type: app.id ? "azureEndpoints" : "externalEndpoints",
                targetResourceId: app.id,
                target: app.url,
                endpointLocation: location,
            }, { parent: profile, deleteBeforeReplace: true, ...opts });
        }));

        this.endpoint = pulumi.interpolate`http://${profile.fqdn}`;

        this.registerOutputs();
    }
}
