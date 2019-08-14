# Globally-distributed applications with Azure Cosmos DB and Pulumi

This example demonstrates the usage of Pulumi to create globally-distributed applications with Azure Cosmos DB at the backend and pluggable infrastrustructure at web tier.

The application shows several notable features:

1. Easy global deployments - a single config setting allows providing a list of all the regions to deploy to and a single execution deploys across them all.
2. Abstraction - the `GlobalApp` component abstracts away all the common logic for a global app - the CosmodDB global deployment, the TrafficManager for distributing global traffic, etc.
3. Multi-model - examples of each of serverless, containers and VMs fitting into the above abstraction.
4. Global + Local abstraction - in particular, the simple abstraction for defining both the app-specific global components and app-specific regional components using simple functional composition (see [aci.ts](https://github.com/mikhailshilkov/pulumi-cosmos/blob/master/aci.ts) for an example of this part).

## `GlobalApp` component

The [`GlobalApp`](https://github.com/mikhailshilkov/pulumi-cosmos/blob/master/globalApp.ts) define a skeleton for the application. While it does not limit the type of compute infrastructure, it creates the multi-regional pieces of the infrastructure:

![Global App](https://github.com/mikhailshilkov/pulumi-cosmos/raw/master/pictures/globalapp.png)

The application has three example of using this component with the following compute services:
- Azure Functions
- Azure Container Intances
- Azure VM Scale Sets + Azure Load Balancer

## Serverless

![Function App](https://github.com/mikhailshilkov/pulumi-cosmos/raw/master/pictures/functions.png)

## Containers

![Container Instances](https://github.com/mikhailshilkov/pulumi-cosmos/raw/master/pictures/containers.png)

## Virtual Machines

![VM Scale Sets](https://github.com/mikhailshilkov/pulumi-cosmos/raw/master/pictures/vmscalesets.png)