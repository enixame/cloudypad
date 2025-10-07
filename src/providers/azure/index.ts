/**
 * Azure Provider Module
 * Tree-shakable exports for Azure functionality  
 */

// Core Azure client and interfaces
export { AzureProviderClient } from './provider';
export { AzureProvisioner } from './provisioner';
export { AzureInstanceRunner } from './runner';

// State management
export { 
  AzureProvisionInputV1Schema,
  AzureProvisionOutputV1Schema,
  type AzureProvisionInputV1,
  type AzureProvisionOutputV1
} from './state';

// Factory
export { createAzureProvisioner, createAzureRunner } from './factory';