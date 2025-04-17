/**
 * Inversion of Control (IoC) container that lets you register and resolve
 * dependencies.
 */
export type IocContainer<Factories extends Record<string, any>> = {
  /**
   * Add one or more services to the container.
   * Any dependencies of the registered services must have been registered in a
   * previous call to `register`, or else you will get a type error. This makes
   * it impossible to accidentally create a circular dependency.
   */
  register<
    NewFactories extends Record<
      string,
      | ((deps: ToDependencies<Factories>) => any)
      | { new (deps: ToDependencies<Factories>): any }
    >,
  >(
    factories: NewFactories,
  ): IocContainer<Factories & NewFactories>;

  /**
   * Get an already instantiated service or create a new instance of one. When
   * creating an instance, all dependencies it relies on are also resolved.
   */
  resolve<Key extends keyof Factories>(key: Key): ReturnType<Factories[Key]>;
};

/**
 * Creates an empty {@link IocContainer} for registering and injecting dependencies.
 */
export function createIocContainer(): IocContainer<{}> {
  const factories: Record<
    string,
    ((deps: any) => any) | { new (deps: any): any }
  > = {};
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

      return isClass(factory)
        ? (instanceCache[key] = new factory(resolveProxy))
        : (instanceCache[key] = factory(resolveProxy));
    },
  };

  return container;
}

function isClass(obj: any): obj is { new (...args: any[]): any } {
  return typeof obj === "function" && !!obj.prototype?.constructor;
}

/** Converts a Record of factory functions and classes to a map of their return type and instance type respectively. */
export type ToDependencies<T extends Record<string, (...args: any[]) => any>> =
  {
    [key in keyof T]: T[key] extends (...args: any[]) => infer R ? R : never;
  };
