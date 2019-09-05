import * as azure from "@pulumi/azure";
import * as pulumi from "@pulumi/pulumi";
import { readFileSync } from "fs";
import { GlobalContext, RegionalContext } from "./globalApp";

export function buildVMScaleSetApp({ resourceGroup, cosmosdb, opts }: GlobalContext) {
    const file = readFileSync("./vmCustomData.yaml").toString();

    const database = new azure.cosmosdb.SqlDatabase("vms-db", {
        resourceGroupName: resourceGroup.name,
        accountName: cosmosdb.name,
    }, opts);

    const collection = new azure.cosmosdb.SqlContainer("vms-items", {
        resourceGroupName: resourceGroup.name,
        accountName: cosmosdb.name,
        databaseName: database.name,
    }, opts);

    return ({ location }: RegionalContext) => {
        const publicIp = new azure.network.PublicIp(`pip-${location}`, {
            resourceGroupName: resourceGroup.name,
            allocationMethod: "Static",
            domainNameLabel: `fncydmn-${location}`,
        }, opts);

        const loadBalancer = new azure.lb.LoadBalancer(`lb-${location}`, {
            resourceGroupName: resourceGroup.name,
            frontendIpConfigurations: [{
                name: "PublicIPAddress",
                publicIpAddressId: publicIp.id,
            }],
        }, opts);

        const bpepool = new azure.lb.BackendAddressPool(`bap-${location}`, {
            resourceGroupName: resourceGroup.name,
            loadbalancerId: loadBalancer.id,
        }, opts);

        const probe = new azure.lb.Probe(`ssh-probe-${location}`.substring(0, 16), {
            resourceGroupName: resourceGroup.name,
            loadbalancerId: loadBalancer.id,
            port: 80,
        }, opts);

        const rule = new azure.lb.Rule(`rule-${location}`, {
            resourceGroupName: resourceGroup.name,
            backendAddressPoolId: bpepool.id,
            backendPort: 80,
            frontendIpConfigurationName: "PublicIPAddress",
            frontendPort: 80,
            loadbalancerId: loadBalancer.id,
            probeId: probe.id,
            protocol: "Tcp",
        }, opts);

        const vnet = new azure.network.VirtualNetwork(`vnet-${location}`, {
            resourceGroupName: resourceGroup.name,
            addressSpaces: ["10.0.0.0/16"],
        }, opts);

        const subnet = new azure.network.Subnet(`subnet-${location}`, {
            resourceGroupName: resourceGroup.name,
            addressPrefix: "10.0.2.0/24",
            virtualNetworkName: vnet.name,
        }, opts);

        const customData = pulumi.all([cosmosdb.endpoint, cosmosdb.primaryMasterKey, database.name, collection.name])
            .apply(([endpoint, key, databaseName, collectionName]) => {
                const s = file.replace("${ENDPOINT}", endpoint)
                    .replace("${MASTER_KEY}", key)
                    .replace("${DATABASE}", databaseName)
                    .replace("${COLLECTION}", collectionName)
                    .replace("${LOCATION}", location);
                return s;
            });

        const scaleSet = new azure.compute.ScaleSet(`vmss-${location}`, {
            resourceGroupName: resourceGroup.name,
            networkProfiles: [{
                ipConfigurations: [{
                    loadBalancerBackendAddressPoolIds: [bpepool.id],
                    name: "IPConfiguration",
                    primary: true,
                    subnetId: subnet.id,
                }],
                name: "networkprofile",
                primary: true,
            }],
            osProfile: {
                adminUsername: "neo",
                adminPassword: "SEcurePwd$3",
                computerNamePrefix: "lab",
                customData,
            },
            osProfileLinuxConfig: {
                disablePasswordAuthentication: false,
            },
            sku: {
                capacity: 1,
                name: "Standard_DS1_v2",
                tier: "Standard",
            },
            storageProfileDataDisks: [{
                caching: "ReadWrite",
                createOption: "Empty",
                diskSizeGb: 10,
                lun: 0,
            }],
            storageProfileImageReference: {
                offer: "UbuntuServer",
                publisher: "Canonical",
                sku: "18.04-LTS",
                version: "latest",
            },
            storageProfileOsDisk: {
                caching: "ReadWrite",
                createOption: "FromImage",
                managedDiskType: "Standard_LRS",
                name: "",
            },
            upgradePolicyMode: "Automatic",
        }, { dependsOn: [bpepool], ...opts });

        const autoscale = new azure.monitoring.AutoscaleSetting(`as-${location}`, {
            resourceGroupName: resourceGroup.name,
            notification: {
                email: {
                    customEmails: ["admin@contoso.com"],
                    sendToSubscriptionAdministrator: true,
                    sendToSubscriptionCoAdministrator: true,
                },
            },
            profiles: [{
                capacity: {
                    default: 1,
                    maximum: 10,
                    minimum: 1,
                },
                name: "defaultProfile",
                rules: [
                    {
                        metricTrigger: {
                            metricName: "Percentage CPU",
                            metricResourceId: scaleSet.id,
                            operator: "GreaterThan",
                            statistic: "Average",
                            threshold: 75,
                            timeAggregation: "Average",
                            timeGrain: "PT1M",
                            timeWindow: "PT5M",
                        },
                        scaleAction: {
                            cooldown: "PT1M",
                            direction: "Increase",
                            type: "ChangeCount",
                            value: 1,
                        },
                    },
                    {
                        metricTrigger: {
                            metricName: "Percentage CPU",
                            metricResourceId: scaleSet.id,
                            operator: "LessThan",
                            statistic: "Average",
                            threshold: 25,
                            timeAggregation: "Average",
                            timeGrain: "PT1M",
                            timeWindow: "PT5M",
                        },
                        scaleAction: {
                            cooldown: "PT1M",
                            direction: "Decrease",
                            type: "ChangeCount",
                            value: 1,
                        },
                    },
                ],
            }],
            targetResourceId: scaleSet.id,
        }, opts);

        return {
            id: publicIp.id,
        };
    };
}
