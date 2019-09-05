import * as azure from "@pulumi/azure";
import * as pulumi from "@pulumi/pulumi";
import { buildContainerApp } from "./aci";
import { buildFunctionApp } from "./functionApp";
import { GlobalApp } from "./globalApp";
import { buildVMScaleSetApp } from "./vms";

// Read a list of target locations from the config file:
// Expecting a comma-separated list, e.g., "westus,eastus,westeurope"
const locations = new pulumi.Config().require("locations").split(",");

const resourceGroup = new azure.core.ResourceGroup("UrlShorterner", {
    location: locations[0],
});

// Cosmos DB + Azure Functions
const functions = new GlobalApp("functions", {
    resourceGroup,
    locations,
    factory: buildFunctionApp,
});

// Cosmos DB + Azure Container Instances
const aci = new GlobalApp("aci", {
    resourceGroup,
    locations,
    factory: buildContainerApp,
});

// Cosmos DB + Azure VM Scale Sets
const vmss = new GlobalApp("vms", {
    resourceGroup,
    locations,
    factory: buildVMScaleSetApp,
    enableMultiMaster: true,
});

export const functionsEndpoint = pulumi.interpolate`${functions.endpoint}/cosmos`;
export const aciEndpoint = pulumi.interpolate`${aci.endpoint}/cosmos`;
export const vmssEndpoint = pulumi.interpolate`${vmss.endpoint}/cosmos`;
