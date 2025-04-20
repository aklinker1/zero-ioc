/**
 * Inversion of Control (IoC) container that lets you register and resolve
 * dependencies.
 */
export type IocContainer<TFactories extends Record<string, any>> = {
  /**
   * Add one or more services to the container.
   * Any dependencies of the registered services must have been registered in a
   * previous call to `register`, or else you will get a type error. This makes
   * it impossible to accidentally create a circular dependency.
   */
  register<
    TNewFactories extends Record<
      string,
      Factory<{ [key in keyof TFactories]: GetInstance<TFactories[key]> }, any>
    >,
  >(
    factories: TNewFactories,
  ): IocContainer<{
    // Equivalent to `Dependencies & NewFactories`, but types look nicer in IDE and error messages
    [key in
      | keyof TFactories
      | keyof TNewFactories]: key extends keyof TNewFactories
      ? TNewFactories[key]
      : key extends keyof TFactories
        ? TFactories[key]
        : never;
  }>;

  /**
   * Get an already instantiated service or create a new instance of one. When
   * creating an instance, all dependencies it relies on are also resolved.
   *
   * Attempting to resolve a key that has not been registered will throw an error.
   */
  resolve<Key extends keyof TFactories>(key: Key): GetInstance<TFactories[Key]>;

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
  registrations: Readonly<{
    [key in keyof TFactories]: GetInstance<TFactories[key]>;
  }>;

  /**
   * Resolves all dependencies immediately and returns an object containing
   * them. This differs from {@link IocContainer#registrations} because it
   * resolves all dependencies when called, instead of waiting for a service to
   * be accessed.
   *
   * Can be useful if a library doesn't work well with Proxies, and you need a
   * real object containing all dependencies.
   */
  resolveAll(): { [key in keyof TFactories]: GetInstance<TFactories[key]> };
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
  const factories: Record<string, Factory<any, any>> = {};
  const instanceCache: Record<string, any> = {};

  const resolveProxy = new Proxy(
    {},
    {
      get(_, p) {
        return container.resolve(p as string);
      },
    },
  );

  const container: IocContainer<any> = {
    register(newFactories) {
      for (const [key, factory] of Object.entries(newFactories)) {
        if (factories[key]) {
          throw Error(`Service "${key}" already registered`);
        }
        factories[key] = factory;
      }
      return container;
    },
    resolve(key) {
      if (instanceCache[key as string]) return instanceCache[key as string];

      const factory = factories[key as string];
      if (!factory) throw Error(`Service "${key as string}" not found`);

      return (instanceCache[key as string] = instantiate(
        factory,
        resolveProxy,
      ));
    },
    get registrations() {
      return resolveProxy;
    },
    resolveAll() {
      return Object.keys(factories).reduce(
        (acc, key) => {
          acc[key] = container.resolve(key);
          return acc;
        },
        {} as Record<string, any>,
      );
    },
  };

  return container;
}

function instantiate<TFactory extends Factory<any, any>>(
  factory: TFactory,
  deps: any,
): GetInstance<TFactory> {
  return isClass(factory) ? new factory(deps) : factory(deps);
}

function isClass(obj: any): obj is { new (...args: any[]): any } {
  return typeof obj === "function" && !!obj.prototype?.constructor;
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
export type FactoryClass<TDeps, TInstance> = {
  new (deps: TDeps): TInstance;
};

/** Given a factory, return the dependencies it requires. */
export type GetDependencies<TFactory> = TFactory extends (
  deps: infer Deps,
) => any
  ? Deps
  : TFactory extends { new (deps: infer Deps): any }
    ? Deps
    : never;

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
