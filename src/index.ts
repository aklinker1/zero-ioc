/**
 * Inversion of Control (IoC) container that lets you register and resolve
 * dependencies.
 */
export type IocContainer<TInstances extends Record<string, any>> = {
  /**
   * Add one or more services to the container.
   * Any dependencies of the registered services must have been registered in a
   * previous call to `register`, or else you will get a type error. This makes
   * it impossible to accidentally create a circular dependency.
   */
  register<
    TServiceName extends string,
    TFactory extends Factory<TInstances, any>,
  >(
    key: TServiceName,
    factory: TFactory,
  ): IocContainer<{
    // Equivalent to `TInstances & { [TServiceName]: GetInstance<TFactory> }`, but types look nicer in IDE and error messages
    [key in keyof TInstances | TServiceName]: key extends TServiceName
      ? GetInstance<TFactory>
      : key extends keyof TInstances
        ? TInstances[key]
        : never;
  }>;
  register<TNewFactories extends Record<string, Factory<TInstances, any>>>(
    factories: TNewFactories,
  ): IocContainer<{
    // Equivalent to `TInstances & { [key]: GetInstance<...> }`, but types look nicer in IDE and error messages
    [key in
      | keyof TInstances
      | keyof TNewFactories]: key extends keyof TNewFactories
      ? GetInstance<TNewFactories[key]>
      : key extends keyof TInstances
        ? TInstances[key]
        : never;
  }>;

  /**
   * Define a scope with an initial set of dependencies that will be provided later in the application's lifecycle, not during startup.
   *
   * ```ts
   * function createAuthService(deps: { database: Database, request: Request }): AuthService {
   *   // This service depends on the `Request`, but we don't have that until the request is sent.
   * }
   *
   *
   * const container = createIocContainer()
   *   .register("database", openDatabase)
   *
   *
   * const httpScope = container.
   *   .scope<{ request: Request }>()
   *   .register("authService", createAuthService)
   *
   * Bun.serve({
   *   fetch: (request) => {
   *     const container = httpScope({ request })
   *     const { authService } = container.registrations
   *   }
   * })
   * ```
   *
   * @returns an {@link IocContainer} containing the scope's dependencies and registrations.
   */
  scope<TDeps extends Record<string, any>>(): IocScope<
    TDeps,
    {
      [key in keyof TInstances | keyof TDeps]: key extends keyof TDeps
        ? TDeps[key]
        : key extends keyof TInstances
          ? TInstances[key]
          : never;
    }
  >;

  /**
   * Get an already instantiated service or create a new instance of one. When
   * creating an instance, all dependencies it relies on are also resolved.
   *
   * Attempting to resolve a key that has not been registered will throw an error.
   */
  resolve<Key extends keyof TInstances>(key: Key): TInstances[Key];

  /**
   * A proxy object giving you access to all registered services. It can be
   * destructured. When you access a service from this object, its the same
   * thing as calling `resolve` with the key.
   *
   * Accessing an unregistered key will throw an error just like `resolve`.
   *
   * > This is the same proxy object passed as the first argument to factory functions!
   *
   * @example
   * ```ts
   * const container = createIocContainer()
   *   .register({ db: Database })
   *   .register({ userRepo: createUserRepo })
   *
   * const { db, userRepo } = container.registrations;
   * ```
   */
  registrations: Readonly<TInstances>;

  /**
   * Resolves all dependencies immediately and returns an object containing
   * them. This differs from {@link IocContainer#registrations} because it
   * resolves all dependencies when called, instead of waiting for a service to
   * be accessed.
   *
   * Can be useful if a library doesn't work well with Proxies, and you need a
   * real object containing all dependencies.
   */
  resolveAll(): TInstances;
};

/**
 * A scope is similar to a {@link IocContainer}, but instead of providing functions to resolve dependencies, it is a function that returns a container.
 */
export type IocScope<
  TDeps extends Record<string, any>,
  TInstances extends Record<string, any>,
> = {
  /**
   * Instantiate the scope with it's required dependencies.
   * @returns a {@link IocContainer} that can be used to access dependencies
   */
  (deps: TDeps): IocContainer<TInstances>;

  /**
   * Register services on the scope, same as registering services on a container.
   * @see {@link IocContainer#register}
   */
  register<
    TServiceName extends string,
    TFactory extends Factory<TInstances, any>,
  >(
    key: TServiceName,
    factory: TFactory,
  ): IocScope<
    TDeps,
    {
      // Equivalent to `TInstances & { [TServiceName]: GetInstance<TFactory> }`, but types look nicer in IDE and error messages
      [key in keyof TInstances | TServiceName]: key extends TServiceName
        ? GetInstance<TFactory>
        : key extends keyof TInstances
          ? TInstances[key]
          : never;
    }
  >;
  register<TNewFactories extends Record<string, Factory<TInstances, any>>>(
    factories: TNewFactories,
  ): IocScope<
    TDeps,
    {
      // Equivalent to `TInstances & { [key]: GetInstance<...> }`, but types look nicer in IDE and error messages
      [key in
        | keyof TInstances
        | keyof TNewFactories]: key extends keyof TNewFactories
        ? GetInstance<TNewFactories[key]>
        : key extends keyof TInstances
          ? TInstances[key]
          : never;
    }
  >;
};

/**
 * Creates an empty {@link IocContainer} for registering and injecting dependencies.
 *
 * @example
 * ```ts
 * const container = createIocContainer()
 *   .register({ db: Database })
 *   .register({ userRepo: createUserRepo })
 * ```
 */
export function createIocContainer(): IocContainer<{}> {
  return createInternalIocContainer();
}

class Registrations {
  proxy = new Proxy<Record<string, any>>(Object.create(null), {
    get: (_, key: string) => {
      const res = this.resolve(key);
      if (!res) throw Error(`Service "${key}" not found`);
      return res;
    },
  });

  private factories: Record<string, Factory<any, any>> = Object.create(null);
  private instanceCache: Record<string, any> = Object.create(null);

  constructor(private parent?: Registrations) {}

  has(key: string): boolean {
    return key in this.factories || (this.parent?.has(key) ?? false);
  }

  addFactory(key: string, factory: Factory<any, any>): void {
    if (this.has(key)) throw Error(`Service "${key}" already registered`);

    this.factories[key] = factory;
  }

  resolve(key: string): unknown | undefined {
    // Look at the parent first
    if (this.parent) {
      const instance = this.parent.resolve(key);
      if (instance) return instance;
    }

    // The look for factories and cached instances here
    const factory = this.factories[key];
    if (!factory) return undefined;

    if (TRANSIENT_SYMBOL in factory) return instantiate(factory, this.proxy);

    return (this.instanceCache[key] ??= instantiate(factory, this.proxy));
  }

  resolveAll(): Record<string, any> {
    const acc = this.parent?.resolveAll() ?? Object.create(null);

    for (const key in this.factories) {
      acc[key] = this.resolve(key);
    }

    return acc;
  }
}

function createInternalIocContainer(
  registrations = new Registrations(),
): IocContainer<{}> {
  const container: IocContainer<Record<string, any>> = {
    register(arg1: any, arg2?: any) {
      if (typeof arg1 === "string") {
        registrations.addFactory(arg1, arg2);
      } else {
        for (const [key, factory] of Object.entries<Factory<any, any>>(arg1)) {
          registrations.addFactory(key, factory);
        }
      }
      return container;
    },

    resolve(key) {
      return registrations.resolve(key);
    },

    registrations: registrations.proxy,

    resolveAll() {
      return registrations.resolveAll();
    },

    scope() {
      return createIocScope(registrations);
    },
  };

  return container;
}

function createIocScope<
  TDeps extends Record<string, any>,
  TInstances extends Record<string, any>,
>(parent: Registrations): IocScope<TDeps, TInstances> {
  const factories: Array<[key: string, factory: Factory<any, any>]> = [];

  // @ts-expect-error: Declaring a function with a named function property
  const scope: IocScope<any, any> = (deps) => {
    const registrations = new Registrations(parent);
    for (const entry of Object.entries(deps)) {
      registrations.addFactory(entry[0], () => entry[1]);
    }
    for (const [key, factory] of factories) {
      registrations.addFactory(key, factory);
    }
    return createInternalIocContainer(registrations);
  };

  // @ts-expect-error: Declaring a function with a named function property
  scope.register = (arg1, arg2) => {
    if (typeof arg1 === "string") {
      factories.push([arg1, arg2]);
    } else {
      for (const [key, factory] of Object.entries<Factory<any, any>>(arg1)) {
        factories.push([key, factory]);
      }
    }
    return scope;
  };

  return scope;
}

function instantiate<TFactory extends Factory<any, any>>(
  factory: TFactory,
  deps: any,
): GetInstance<TFactory> {
  return factory.prototype
    ? // Classes and functions have a prototype, and can be created via `new`.
      new (factory as any)(deps)
    : // Lambdas don't have a prototype, so they are called directly.
      (factory as any)(deps);
}

/**
 * A factory is a function or class with dependencies.
 */
export type Factory<TDeps, TInstance> =
  | FactoryFunction<TDeps, TInstance>
  | FactoryClass<TDeps, TInstance>;

/** Converts a map of dependencies to a map of factories. */
export type ToFactoryMap<TDependencies extends Record<string, any>> = {
  [Key in keyof TDependencies]: Factory<TDependencies[Key], any>;
};

/**
 * A factory function is a function that takes dependencies as the first
 * argument and returns an instance of a service.
 */
export type FactoryFunction<TDeps, TInstance> = (deps: TDeps) => TInstance;

/**
 * A factory class is a class that takes dependencies as the first argument of
 * it's constructor.
 */
export type FactoryClass<TDeps, TInstance> = { new (deps: TDeps): TInstance };

/** Given a factory, return the dependencies it requires. */
export type GetDependencies<TFactory> = TFactory extends (
  deps: infer Deps,
) => any
  ? Deps
  : TFactory extends { new (deps: infer Deps): any }
    ? Deps
    : never;

/** Returns the map of names to service types for a container. */
export type GetServices<T extends IocContainer<any>> =
  T extends IocContainer<infer S> ? S : never;

/** Given a factory, return the instance it creates. */
export type GetInstance<TFactory> = TFactory extends (
  ...args: any[]
) => infer Instance
  ? Instance
  : TFactory extends { new (...args: any[]): infer Instance }
    ? Instance
    : never;

/**
 * Sometimes services need additional parameters passed in that aren't
 * dependencies. You can use this function to inject additional parameters into
 * the factory's first argument.
 *
 * @example
 * ```ts
 * class Database {
 *   constructor(
 *     private deps: { username: string, password: string },
 *   ) {}
 * }
 *
 * const container = createIocContainer()
 *   .register({
 *     db: parameterize(Database, {
 *       username: 'root',
 *       password: 'root'
 *     })
 *   })
 * ```
 */
export function parameterize<
  TFactory extends Factory<any, any>,
  TParams extends Record<string, any>,
>(
  factory: TFactory,
  parameters: TParams,
): Factory<
  {
    [key in keyof GetDependencies<TFactory> as key extends keyof TParams
      ? never
      : key]: GetDependencies<TFactory>[key];
  },
  GetInstance<TFactory>
> {
  return (deps: any) => {
    // Since deps is a proxy, we can't spread it. Instead, we create a second proxy wrapping it.
    const depsWithParameters = new Proxy(parameters, {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        return deps[prop];
      },
    });
    return instantiate(factory, depsWithParameters);
  };
}

const TRANSIENT_SYMBOL = Symbol("zero-ioc/transient");

/**
 * Make a service "transient" instead of a singleton. Whenever the container
 * resolves a transient service, a new instance is created.
 *
 * @param factory The service factory or class to register as transient.
 * @returns the IoC container.
 *
 * @example
 *
 * ```ts
 * import { createIocContainer, transient } from '@aklinker1/zero-ioc';
 * import { createUserService } from './user-service';
 *
 * const container = createIocContainer()
 *   .register("userService", transient(createUserService))
 * ```
 */
export function transient<T extends Factory<any, any>>(factory: T): T {
  const transientFactory = (deps: any) => instantiate(factory, deps);
  transientFactory[TRANSIENT_SYMBOL] = true;
  return transientFactory as any as T;
}
