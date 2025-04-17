/**
 * Inversion of Control (IoC) container that lets you register and resolve
 * dependencies.
 */
export type IocContainer<RegisteredFactories extends Record<string, any>> = {
  /**
   * Add one or more services to the container.
   * Any dependencies of the registered services must have been registered in a
   * previous call to `register`, or else you will get a type error. This makes
   * it impossible to accidentally create a circular dependency.
   */
  register<NewFactories extends Record<string, Factory<RegisteredFactories>>>(
    factories: NewFactories,
  ): IocContainer<{
    // Equivalent to `RegisteredFactories & NewFactories`, but types look nicer in IDE and error messages
    [key in
      | keyof RegisteredFactories
      | keyof NewFactories]: key extends keyof NewFactories
      ? NewFactories[key]
      : key extends keyof RegisteredFactories
        ? RegisteredFactories[key]
        : never;
  }>;

  /**
   * Get an already instantiated service or create a new instance of one. When
   * creating an instance, all dependencies it relies on are also resolved.
   *
   * Attempting to resolve a key that has not been registered will throw an error.
   */
  resolve<Key extends keyof RegisteredFactories>(
    key: Key,
  ): ReturnType<RegisteredFactories[Key]>;

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
    // Inline version of ToDependencies so types look better in IDE and error messages
    [key in keyof RegisteredFactories]: RegisteredFactories[key] extends FactoryFunction<RegisteredFactories>
      ? ReturnType<RegisteredFactories[key]>
      : RegisteredFactories[key] extends FactoryClass<RegisteredFactories>
        ? InstanceType<RegisteredFactories[key]>
        : never;
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
  resolveAll(): {
    // Inline version of ToDependencies so types look better in IDE and error messages
    [key in keyof RegisteredFactories]: RegisteredFactories[key] extends FactoryFunction<RegisteredFactories>
      ? ReturnType<RegisteredFactories[key]>
      : RegisteredFactories[key] extends FactoryClass<RegisteredFactories>
        ? InstanceType<RegisteredFactories[key]>
        : never;
  };
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
  const factories: Record<string, Factory<any>> = {};
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
    resolve(_key) {
      const key = _key as string;
      if (instanceCache[key]) return instanceCache[key];

      const factory = factories[key];
      if (!factory) throw Error(`Service "${key}" not found`);

      return (instanceCache[key] = callFactory(factory, resolveProxy));
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

function callFactory(factory: Factory<any>, deps: any) {
  return isClass(factory) ? new factory(deps) : factory(deps);
}

function isClass(obj: any): obj is { new (...args: any[]): any } {
  return typeof obj === "function" && !!obj.prototype?.constructor;
}

/** Converts a Record of factory functions and classes to a map of their return type and instance type respectively. */
export type ToDependencies<T extends Record<string, (...args: any[]) => any>> =
  {
    [key in keyof T]: T[key] extends FactoryFunction<T>
      ? ReturnType<T[key]>
      : T[key] extends FactoryClass<T>
        ? InstanceType<T[key]>
        : never;
  };

/**
 * A factory is a function or class with dependencies.
 */
export type Factory<RegisteredFactories extends Record<string, any>> =
  | FactoryFunction<RegisteredFactories>
  | FactoryClass<RegisteredFactories>;
/**
 * A factory function is a function that takes dependencies as the first
 * argument and returns an instance of a service.
 */
export type FactoryFunction<RegisteredFactories extends Record<string, any>> = (
  deps: ToDependencies<RegisteredFactories>,
) => any;
/**
 * A factory class is a class that takes dependencies as the first argument of
 * it's constructor.
 */
export type FactoryClass<RegisteredFactories extends Record<string, any>> = {
  new (deps: ToDependencies<RegisteredFactories>): any;
};

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
  Parameters extends Record<string, any>,
  Dependencies extends Record<string, any>,
>(
  factory: Factory<Dependencies>,
  parameters: Parameters,
): Factory<{
  // Equivalent to Factory<Omit<Dependencies, keyof Parameters>>, but TS
  // displays this type in an easy to read format, "Factory<{ ... }>", vs
  // "Factory<Omit<{ ... }, keyof { ... }>>" in error messages and when hovering
  // over a variable in your IDE.
  [K in keyof Dependencies as K extends keyof Parameters
    ? never
    : K]: Dependencies[K];
}> {
  return (deps: any) => {
    // Since deps is a proxy, we can't spread it. Instead, we create a second proxy wrapping it.
    const depsWithParameters = new Proxy(parameters, {
      get(target, prop, receiver) {
        if (prop in target) return Reflect.get(target, prop, receiver);
        return deps[prop];
      },
    });
    return callFactory(factory, depsWithParameters);
  };
}
