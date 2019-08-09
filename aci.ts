import * as azure from "@pulumi/azure";
import * as docker from "@pulumi/docker";
import * as pulumi from "@pulumi/pulumi";
import { GlobalContext, RegionalContext } from "./globalApp";

export function buildContainerApp({ resourceGroup, cosmosdb, opts }: GlobalContext) {

    const registry = new azure.containerservice.Registry("global", {
        resourceGroupName: resourceGroup.name,
        adminEnabled: true,
        sku: "Premium",
    }, opts);

    const dockerImage = new docker.Image("node-app", {
        imageName: pulumi.interpolate`${registry.loginServer}/mynodeapp:v1.0.0`,
        build: {
            context: "./container",
        },
        registry: {
            server: registry.loginServer,
            username: registry.adminUsername,
            password: registry.adminPassword,
        },
    }, opts);

    return ({ location }: RegionalContext) => {
        const group = new azure.containerservice.Group(`aci-${location}`, {
            resourceGroupName: resourceGroup.name,
            location,
            imageRegistryCredentials: [{
                server: registry.loginServer,
                username: registry.adminUsername,
                password: registry.adminPassword,
            }],
            osType: "Linux",
            containers: [
                {
                    cpu: 0.5,
                    image: dockerImage.imageName,
                    memory: 1.5,
                    name: "hello-world",
                    ports: [{
                        port: 80,
                        protocol: "TCP",
                    }],
                    environmentVariables: {
                        ENDPOINT: cosmosdb.endpoint,
                        MASTER_KEY: cosmosdb.primaryMasterKey,
                        LOCATION: location,
                    },
                },
            ],
            ipAddressType: "public",
            dnsNameLabel: `aciasf-${location}`,
        }, { deleteBeforeReplace: true, ...opts });

        return {
            url: group.fqdn,
        };
    };
}
