/**
 * Generic Test Helpers Architecture
 * Provides immutable builder patterns with Copy-on-Write optimization for all cloud providers
 * 
 * Features:
 * - Type-safe state builders with fluent interface
 * - Automatic sinon stub management with cleanup
 * - Multi-provider coordination and testing
 * - Immutable state patterns with performance optimization
 */

import * as sinon from 'sinon'

/**
 * Core state structure that all provider states must implement
 * Ensures consistency while allowing provider-specific extensions
 */
export interface MinimalState {
    readonly [key: string]: unknown
    readonly version?: string
    readonly name?: string
}

/**
 * Standard state structure - compatible with InstanceStateV1
 * Extends MinimalState with common cloud provider fields
 */
export interface BaseState extends MinimalState {
    readonly version?: "1"
    readonly name?: string
    readonly provision?: {
        readonly provider?: string
        readonly input?: Record<string, unknown>
        readonly output?: Record<string, unknown>
    }
    readonly configuration?: {
        readonly configurator?: string
        readonly input?: Record<string, unknown>
        readonly output?: Record<string, unknown>
    }
}

/**
 * Base configuration for provider-specific test helpers
 */
export interface ProviderTestConfig<TState extends BaseState, TConstants extends Record<string, unknown>> {
    /** Provider name for identification */
    providerName: string
    /** Default state template */
    defaultState: TState
    /** Provider-specific test constants */
    constants: TConstants
    /** Function to create deep clones */
    cloneFunction: (state: TState) => TState
}

/**
 * Utility types for immutability and type safety
 */
export type DeepReadonly<T> = {
    readonly [P in keyof T]: T[P] extends object ? DeepReadonly<T[P]> : T[P]
}

export type BuilderModification<T> = (state: T) => void

export type ImmutableState<T> = DeepReadonly<T> & { readonly __immutable: true }

/**
 * Simplified type aliases for better readability and performance
 */
type SinonStubMethod<T, K extends keyof T> = T[K] extends (...args: unknown[]) => unknown ? T[K] : never
type StubParameters<T, K extends keyof T> = Parameters<SinonStubMethod<T, K>>
type StubReturnType<T, K extends keyof T> = ReturnType<SinonStubMethod<T, K>>
type TypedSinonStub<T, K extends keyof T> = sinon.SinonStub<StubParameters<T, K>, StubReturnType<T, K>>

/**
 * Type aliases for complex generic signatures
 */
type AnyTestEnvironment = GenericTestEnvironment<BaseState, Record<string, unknown>>
type ProviderRegistrationArgs<TState extends BaseState> = {
    manager: MultiProviderTestManager<BaseState>
    name: string
    environment: GenericTestEnvironment<TState, Record<string, unknown>>
}

/**
 * Simple APIs for beginners - hide the complexity
 */
export interface SimpleTestEnvironment {
    /** Create a mock state - no generics needed, supports chaining */
    createState(): SimpleTestEnvironment & SimpleStateBuilder
    /** Create a mock client - no generics needed */  
    createClient(): Record<string, unknown>
    /** Clean up everything */
    cleanup(): void
}

export interface SimpleStateBuilder {
    /** Change any field using simple dot notation */
    set(path: string, value: unknown): this
    /** Get the final state */
    get(): Record<string, unknown>
}

/**
 * Generic Test Environment Builder
 * Manages sinon stubs, test data factories, and provider-specific mocks
 */
export class GenericTestEnvironment<TState extends BaseState, TConstants extends Record<string, unknown>> {
    private readonly stubs = new Map<string, sinon.SinonStub>()
    private readonly providers = new Map<string, unknown>()
    private readonly config: ProviderTestConfig<TState, TConstants>

    constructor(config: ProviderTestConfig<TState, TConstants>) {
        this.config = config
    }

    /**
     * Creates a sinon stub and tracks it for automatic cleanup
     * Returns a properly typed stub for better IDE support and type safety
     */
    createStub<T extends object, K extends keyof T>(
        object: T,
        method: K,
        stubName?: string
    ): TypedSinonStub<T, K> {
        const name = stubName || `${String(method)}_${this.stubs.size}`
        const stub = sinon.stub(object, method)
        this.stubs.set(name, stub)
        return stub as TypedSinonStub<T, K>
    }

    /**
     * Gets a previously created stub by name
     */
    getStub(name: string): sinon.SinonStub | undefined {
        return this.stubs.get(name)
    }

    /**
     * Restores all stubs and cleans up the environment
     */
    cleanup(): void {
        for (const stub of this.stubs.values()) {
            stub.restore()
        }
        this.stubs.clear()
        this.providers.clear()
    }

    /**
     * Gets provider-specific constants
     */
    getConstants(): TConstants {
        return this.config.constants
    }

    /**
     * Creates a default state for testing
     */
    createDefaultState(): TState {
        return this.config.cloneFunction(this.config.defaultState)
    }

    /**
     * Registers a provider client mock
     */
    registerProvider(name: string, provider: unknown): void {
        this.providers.set(name, provider)
    }

    /**
     * Gets a registered provider mock
     */
    getProvider<T>(name: string): T | undefined {
        return this.providers.get(name) as T | undefined
    }
}

/**
 * Generic Immutable State Builder with Copy-on-Write optimization
 * Base class that can be extended for provider-specific builders
 */
export abstract class GenericStateBuilder<TState extends BaseState> {
    protected readonly state: DeepReadonly<TState>
    protected readonly pendingChanges: Map<string, unknown>
    protected readonly isCloned: boolean

    constructor(
        initialState: DeepReadonly<TState>,
        pendingChanges: Map<string, unknown> = new Map(),
        isCloned: boolean = false
    ) {
        this.state = initialState
        this.pendingChanges = pendingChanges
        this.isCloned = isCloned
    }

    /**
     * Apply pending changes to a state object - Copy-on-Write optimization
     */
    protected applyPendingChanges(state: TState): void {
        for (const [path, value] of this.pendingChanges) {
            this.setNestedValue(state, path, value)
        }
    }

    /**
     * Set nested value safely using dot notation path
     */
    protected setNestedValue(obj: unknown, path: string, value: unknown): void {
        const keys = path.split('.')
        let current = obj as Record<string, unknown>
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i]
            if (!key) continue
            if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
                current[key] = {}
            }
            current = current[key] as Record<string, unknown>
        }
        
        const lastKey = keys[keys.length - 1]
        if (lastKey) {
            current[lastKey] = value
        }
    }

    /**
     * Create a new builder with a field modification - Copy-on-Write
     */
    protected createWithField(path: string, value: unknown): this {
        const newPendingChanges = new Map(this.pendingChanges)
        newPendingChanges.set(path, value)
        return this.createInstance(this.state, newPendingChanges, false)
    }

    /**
     * Template method for creating new instances - must be implemented by subclasses
     */
    protected abstract createInstance(
        state: DeepReadonly<TState>,
        pendingChanges: Map<string, unknown>,
        isCloned: boolean
    ): this

    /**
     * Template method for deep cloning - must be implemented by subclasses
     */
    protected abstract deepClone(state: DeepReadonly<TState>): TState

    /**
     * Build immutable state - Copy-on-Write finalization
     */
    build(): ImmutableState<TState> {
        if (this.pendingChanges.size === 0) {
            // No changes - return readonly view of original state
            return this.state as ImmutableState<TState>
        }

        // Changes detected - perform Copy-on-Write
        const clonedState = this.deepClone(this.state)
        this.applyPendingChanges(clonedState)
        return clonedState as ImmutableState<TState>
    }

    /**
     * Build mutable state - for cases where mutable access is needed
     * Use with caution - prefer build() for immutable access
     */
    buildMutable(): TState {
        if (this.pendingChanges.size === 0) {
            // No changes - return deep clone to ensure mutability
            return this.deepClone(this.state)
        }

        // Changes detected - perform Copy-on-Write
        const clonedState = this.deepClone(this.state)
        this.applyPendingChanges(clonedState)
        return clonedState
    }

    /**
     * Apply custom modifications - allows complex state changes
     */
    withModification(modifier: BuilderModification<TState>): this {
        const clonedState = this.deepClone(this.state)
        this.applyPendingChanges(clonedState)
        modifier(clonedState)
        return this.createInstance(clonedState as DeepReadonly<TState>, new Map(), true)
    }
}

/**
 * Generic Test Factory for creating provider-specific test data
 */
export abstract class GenericTestFactory<TState extends BaseState, TConstants extends Record<string, unknown>> {
    protected readonly constants: TConstants

    constructor(constants: TConstants) {
        this.constants = constants
    }

    /**
     * Create minimal valid state for testing
     */
    abstract createMinimalState(): TState

    /**
     * Create fully populated state for comprehensive testing
     */
    abstract createFullState(): TState

    /**
     * Create state with specific configuration
     */
    abstract createStateWithConfig(config: Partial<Record<string, unknown>>): TState

    /**
     * Create invalid state for error testing
     */
    abstract createInvalidState(): TState

    /**
     * Get test constants
     */
    getConstants(): TConstants {
        return this.constants
    }
}

/**
 * Generic Sinon Stub Manager for organizing test mocks
 */
export class SinonStubManager {
    private readonly stubs = new Map<string, sinon.SinonStub>()
    private readonly collections = new Map<string, Map<string, sinon.SinonStub>>()

    /**
     * Create and register a stub with automatic cleanup tracking
     */
    createStub<T extends object, K extends keyof T>(
        target: T,
        method: K,
        name?: string,
        collection?: string
    ): sinon.SinonStub {
        const stubName = name || `stub_${this.stubs.size}`
        const stub = sinon.stub(target, method)
        
        this.stubs.set(stubName, stub)
        
        if (collection) {
            if (!this.collections.has(collection)) {
                this.collections.set(collection, new Map())
            }
            this.collections.get(collection)!.set(stubName, stub)
        }
        
        return stub
    }

    /**
     * Get a stub by name
     */
    getStub(name: string): sinon.SinonStub | undefined {
        return this.stubs.get(name)
    }

    /**
     * Get all stubs in a collection
     */
    getCollection(name: string): Map<string, sinon.SinonStub> | undefined {
        return this.collections.get(name)
    }

    /**
     * Restore all stubs in a specific collection
     */
    restoreCollection(name: string): void {
        const collection = this.collections.get(name)
        if (collection) {
            for (const stub of collection.values()) {
                stub.restore()
            }
            collection.clear()
        }
    }

    /**
     * Restore all stubs and clean up
     */
    restoreAll(): void {
        for (const stub of this.stubs.values()) {
            stub.restore()
        }
        this.stubs.clear()
        this.collections.clear()
    }

    /**
     * Get statistics about current stubs
     */
    getStats(): { totalStubs: number; collections: number; activeStubs: number } {
        const activeStubs = this.stubs.size // Simplified stats without internal Sinon checks
        return {
            totalStubs: this.stubs.size,
            collections: this.collections.size,
            activeStubs
        }
    }
}

/**
 * Provider-specific setup interface
 * Each provider implements this to define their test configuration
 */
export interface ProviderTestSetup<TState extends BaseState, TClient, TConstants extends Record<string, unknown>> {
    createEnvironment(): GenericTestEnvironment<TState, TConstants>
    createStateBuilder(initialState?: TState): GenericStateBuilder<TState>
    createTestFactory(): GenericTestFactory<TState, TConstants>
    createSdkClientMock(): TClient
    getProviderName(): string
}

/**
 * Test Suite Manager for coordinating multi-provider tests
 */
export class MultiProviderTestManager<TState extends BaseState = BaseState> {
    private readonly environments = new Map<string, GenericTestEnvironment<BaseState, Record<string, unknown>>>()
    private readonly stubManager = new SinonStubManager()

    /**
     * Register a provider test environment
     */
    registerEnvironment(
        name: string,
        environment: GenericTestEnvironment<BaseState, Record<string, unknown>>
    ): void {
        this.environments.set(name, environment)
    }

    /**
     * Get a specific provider environment
     */
    getEnvironment(name: string): GenericTestEnvironment<BaseState, Record<string, unknown>> | undefined {
        return this.environments.get(name)
    }

    /**
     * Run a test across all registered providers
     */
    async runAcrossProviders<T>(
        testFn: (providerName: string, environment: GenericTestEnvironment<BaseState, Record<string, unknown>>) => Promise<T>
    ): Promise<Map<string, T>> {
        const results = new Map<string, T>()
        
        for (const [name, environment] of this.environments) {
            const result = await testFn(name, environment)
            results.set(name, result)
        }
        
        return results
    }

    /**
     * Get the shared stub manager
     */
    getStubManager(): SinonStubManager {
        return this.stubManager
    }

    /**
     * Execute a test across all registered providers
     */
    async executeOnAll<T>(
        testFn: (environment: GenericTestEnvironment<BaseState, Record<string, unknown>>, providerName: string) => Promise<T>
    ): Promise<Record<string, T>> {
        const results: Record<string, T> = {}
        
        for (const [name, environment] of this.environments) {
            results[name] = await testFn(environment, name)
        }
        
        return results
    }

    /**
     * Clean up all environments and stubs
     */
    cleanup(): void {
        for (const environment of this.environments.values()) {
            environment.cleanup()
        }
        this.environments.clear()
        this.stubManager.restoreAll()
    }

    /**
     * Get statistics about registered providers and test state
     */
    /**
     * Register a provider (legacy compatibility method)
     */
    registerProvider(name: string, environment: GenericTestEnvironment<BaseState, Record<string, unknown>>): void {
        this.registerEnvironment(name, environment)
    }

    /**
     * Execute coordinated operation across providers
     */
    executeCoordinatedOperation(operation: string): Record<string, TState> {
        const results: Record<string, TState> = {}
        
        for (const [name, environment] of this.environments) {
            // Create a mock state for this provider operation
            const mockState = environment.createDefaultState()
            // In a real implementation, operation would determine the state transformation
            results[name] = { ...mockState, operation } as unknown as TState
        }
        
        return results
    }

    /**
     * Extract shared configuration from a state
     */
    extractSharedConfig(state: TState): { networking?: unknown; security?: unknown } {
        // Extract shared configuration from state
        const stateObj = state as Record<string, unknown>
        const hasNetworking = stateObj && typeof stateObj === 'object' && 'networking' in stateObj
        const hasSecurity = stateObj && typeof stateObj === 'object' && 'security' in stateObj
        
        return {
            networking: hasNetworking ? stateObj.networking : { vpc: 'shared-vpc', subnet: 'shared-subnet' },
            security: hasSecurity ? stateObj.security : { firewall: 'shared-fw', rules: ['ssh', 'rdp'] }
        }
    }

    /**
     * Apply shared configuration to create state for a provider
     */
    applySharedConfig(providerName: string, sharedConfig: { networking?: unknown; security?: unknown }): TState {
        // Mock state creation with shared config
        const environment = this.getEnvironment(providerName)
        if (!environment) {
            throw new Error(`Provider ${providerName} not registered`)
        }
        
        const baseState = environment.createDefaultState()
        // Apply shared configuration (mock implementation)
        return Object.assign(baseState || {}, {
            provider: providerName,
            sharedConfig
        }) as unknown as TState
    }

    getStats(): {
        providers: number
        totalStubs: number
        environments: string[]
    } {
        return {
            providers: this.environments.size,
            totalStubs: this.stubManager.getStats().totalStubs,
            environments: Array.from(this.environments.keys())
        }
    }
}

/**
 * Type-safe helper functions to eliminate dangerous type conversions
 */

/**
 * Type-safe environment registration with simplified signature
 * Uses structural typing to safely register provider-specific environments
 * 
 * @param args - Registration arguments with manager, name, and environment
 */
export function registerEnvironmentSafely<TState extends BaseState>(
    args: ProviderRegistrationArgs<TState>
): void
export function registerEnvironmentSafely<TState extends BaseState>(
    manager: MultiProviderTestManager<BaseState>,
    name: string,
    environment: GenericTestEnvironment<TState, Record<string, unknown>>
): void
export function registerEnvironmentSafely<TState extends BaseState>(
    managerOrArgs: MultiProviderTestManager<BaseState> | ProviderRegistrationArgs<TState>,
    name?: string,
    environment?: GenericTestEnvironment<TState, Record<string, unknown>>
): void {
    const { manager, name: envName, environment: env } = 
        typeof managerOrArgs === 'object' && 'manager' in managerOrArgs
            ? managerOrArgs
            : { manager: managerOrArgs, name: name!, environment: environment! }
    
    // Safe structural typing conversion
    const baseEnvironment = env as unknown as AnyTestEnvironment
    manager.registerEnvironment(envName, baseEnvironment)
}

/**
 * Simple Test Helper - beginner-friendly API that hides complexity
 * 
 * @example
 * ```typescript
 * // ✅ SIMPLE - perfect for new devs
 * const testHelper = createSimpleTestHelper('scaleway')
 * const state = testHelper.createState()
 *   .set('name', 'my-test')
 *   .set('region', 'fr-par')
 *   .get()
 * ```
 */
export class SimpleTestHelper implements SimpleTestEnvironment, SimpleStateBuilder {
    private environment: AnyTestEnvironment
    private currentState: Record<string, unknown> = {}
    
    constructor(private providerName: string) {
        // Hide the complex generic setup
        const defaultConfig = {
            providerName,
            defaultState: { version: '1', name: `test-${providerName}`, provider: providerName } as BaseState,
            constants: {},
            cloneFunction: (state: BaseState) => ({ ...state })
        }
        this.environment = new GenericTestEnvironment(defaultConfig)
    }
    
    // SimpleTestEnvironment implementation
    createState(): this {
        this.currentState = this.environment.createDefaultState()
        return this
    }
    
    createClient(): Record<string, unknown> {
        return {
            // Mock client with common methods
            provision: () => Promise.resolve(),
            start: () => Promise.resolve(),
            stop: () => Promise.resolve(),
            destroy: () => Promise.resolve()
        }
    }
    
    cleanup(): void {
        this.environment.cleanup()
    }
    
    // SimpleStateBuilder implementation  
    set(path: string, value: unknown): this {
        const keys = path.split('.')
        let current = this.currentState
        
        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i]
            if (!current[key] || typeof current[key] !== 'object') {
                current[key] = {}
            }
            current = current[key] as Record<string, unknown>
        }
        
        const lastKey = keys[keys.length - 1]
        current[lastKey] = value
        return this
    }
    
    get(): Record<string, unknown> {
        return { ...this.currentState }
    }
}

/**
 * 🚀 BEGINNER-FRIENDLY: Create a simple test helper
 * Hides all the complex generics and provides intuitive API
 * 
 * @param provider - Provider name (scaleway, aws, azure, etc.)
 * @returns Simple helper with fluent interface
 */
export function createSimpleTestHelper(provider: string): SimpleTestHelper {
    return new SimpleTestHelper(provider)
}

/**
 * Create a type-safe multi-provider manager (ADVANCED USERS)
 */
export function createSafeMultiProviderManager(): MultiProviderTestManager<BaseState> {
    return new MultiProviderTestManager<BaseState>()
}