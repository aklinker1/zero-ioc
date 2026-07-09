<div align="center">

# `@aklinker1/zero-ioc`

[![JSR](https://jsr.io/badges/@aklinker1/zero-ioc)](https://jsr.io/@aklinker1/zero-ioc) [![NPM Version](https://img.shields.io/npm/v/%40aklinker1%2Fzero-ioc?logo=npm&labelColor=red&color=white)](https://www.npmjs.com/package/@aklinker1/zero-ioc) [![Docs](https://img.shields.io/badge/Docs-blue?logo=readme&logoColor=white)](https://jsr.io/@aklinker1/zero-ioc) [![API Reference](https://img.shields.io/badge/API%20Reference-blue?logo=readme&logoColor=white)](https://jsr.io/@aklinker1/zero-ioc/doc) [![License](https://img.shields.io/npm/l/%40aklinker1%2Fzero-ioc)](https://github.com/aklinker1/zero-ioc/blob/main/LICENSE) [![Benchmarks](https://img.shields.io/badge/Benchmarks-cyan?logo=speedtest&logoColor=black)](https://github.com/aklinker1/zero-ioc/blob/main/bench/results/index.md)

Zero dependency, type-safe, decorator-free Inversion of Control (IoC) container.

</div>

```sh
npm  add @aklinker1/zero-ioc
pnpm add @aklinker1/zero-ioc
yarn add @aklinker1/zero-ioc
bun  add @aklinker1/zero-ioc
deno add @aklinker1/zero-ioc
```

## Usage

Define your services using classes or factory functions.

Both class constructors and factory functions can accept a single argument: an object containing the dependencies. Services with no dependencies can omit the parameter.

```ts
// database.ts
export function openDatabase(): Database {
  // ...
}

// user-repo.ts
export function createUserRepo(deps: { db: Database }): UserRepo {
  // ...
}

// user-service.ts
export class UserService {
  constructor(private readonly deps: { userRepo: UserRepo; db: Database }) {
    // ...
  }
}
```

Once your services are defined, you can register them on a container:

```ts
// main.ts
import { openDatabase } from "./database";
import { createUserRepo } from "./user-repo";
import { UserService } from "./user-service";
import { createIocContainer } from "@aklinker1/zero-ioc";

export const container = createIocContainer()
  .register("db", openDatabase)
  .register("userRepo", createUserRepo)
  .register("userService", UserService);
```

And finally, to get an instance of a service from the container, use the `resolve` method:

```ts
const userService = container.resolve("userService");
```

> [!NOTE]
> Services are created lazily as they are resolved.

## Registration Order

You can only call `register` with a service if you've registered all of its dependencies in separate calls to `register`. For example, if `userRepo` depends on `db`, you must register `db` before registering `userRepo`.

The good news is TypeScript will tell you if you messed this up! If you haven't registered a dependency, you'll get a type error when you try to register the service that depends on it:

<img width="500" alt="Example type error" src="https://raw.githubusercontent.com/aklinker1/zero-ioc/main/.github/dependency-type-error.png">

Additionally, thanks to this type safety, TypeScript will also report an error for circular dependencies!

## Access All Registered Services

To access an object containing all registered services, you have two options:

1. `container.registrations`: A proxy object that resolves services lazily when you access them.
   ```ts
   // Destructure the services
   const { userRepo, userService } = container.registrations;
   // Or access them directly
   const db = container.registrations.db;
   ```
   > This proxy is actually the same object passed into your services as the first argument of the factory function or constructor!
2. `container.resolveAll()`: Immediately resolves all registered services and returns them as a plain object, no proxy magic. Useful when passing services to a third-party library that doesn't support proxies.
   ```ts
   const { userRepo, userService } = container.resolveAll();
   ```

## Service Lifetime

### Singleton

`createIocContainer` uses singletons by default. Once your service has been resolved, it will be cached and the same instance will be returned on subsequent resolutions.

```ts
interface UserRepo {
  // ...
}

function createUserRepo() {
  return {
    // ...
  };
}

const container = createIocContainer().register("userRepo", createUserRepo);

const userRepo1 = container.resolve("userRepo");
const userRepo2 = container.resolve("userRepo");
console.log(userRepo1 === userRepo2); // true
```

### Transient

A "transient" service is one that is created every time it is resolved. Use the `transient` helper to inform the container that your service should be created each time:

```ts
import { createIocContainer, transient } from "@aklinker1/zero-ioc";

interface UserRepo {
  // ...
}

function createUserRepo(): UserRepo {
  console.log("Creating new UserRepo");

  return {
    // ...
  };
}

const container = createIocContainer().register(
  "userRepo",
  transient(createUserRepo),
);

const userRepo1 = container.resolve("userRepo");
const userRepo2 = container.resolve("userRepo");
console.log(userRepo1 === userRepo2); // false
```

Note that when using `container.resolveAll()`, you're resolving all dependencies immediately, and any transient services will be created once.

If you need to create an instance every time, you can either:

1. Use the `container.registrations` proxy, which will return a new instance on every access.
2. Don't use `transient`. Instead, register a function that returns your factory function or class:
   ```ts
   container.register("userRepoFactory", () => createUserRepo);
   const userRepoFactory = container.resolve("userRepoFactory");
   const userRepo1 = userRepoFactory();
   const userRepo2 = userRepoFactory();
   console.log(userRepo1 === userRepo2); // false
   ```

### Scoped

"Scoped" services are created once per "scope" - a short-lived, child container that you create from your main container to handle a single unit of work (like an incoming HTTP request).

Within that same scope, resolving the service multiple times will always return the same instance. This lets you provide request-specific (or otherwise scope-specific) data to your services, such as the current `Request` object.

Here's an example where the `Request` object from Bun's HTTP server is injected into a scoped service on every request:

```ts
// 1. Define a service that depends on a scoped variable/dependency
class AuthService {
  constructor(private deps: { request: Request; database: Database }) {}

  // ...
}

// 2. Create a parent container - the scope will have access to all its registered services
const container = createIocContainer().register("database", Database);

// 3. Call `container.scope` with the scope's variables/dependencies as a type param
const requestScope = container
  .scope<{ request: Request }>()
  // 4. Register your service that depends on the scoped variables
  .register("authService", AuthService);

// 5. When a request comes in, call the `requestScope` function to get a container, then resolve your service
Bun.serve({
  fetch: (request: Request) => {
    const requestContainer = requestScope({ request });
    const { authService } = requestContainer.registrations;

    // ...
  },
});
```

Services registered as singletons on the parent container are not re-created when resolved from a scope. In the code above, the database class is not recreated on every request.

As for transient services, regardless of where they are registered, on the parent container or scope, they will always be re-created when resolved.

## Parameterization

Sometimes you need to pass additional parameters to a service, like config, that aren't themselves registered services.

In this case, use `parameterize`. Any parameters passed in via the second argument don't need to be registered beforehand!

```ts
import { createIocContainer, parameterize } from "@aklinker1/zero-ioc";

const openDatabase = (deps: {
  username: string;
  password: string;
}): Database => {
  // ...
};

const container = createIocContainer().register(
  "db",
  parameterize(openDatabase, {
    username: process.env.DB_USERNAME!,
    password: process.env.DB_PASSWORD!,
  }),
);
```

## Inspiration

This library was heavily inspired by [Awilix](https://github.com/jeffijoe/awilix), a powerful IoC container for JavaScript/TypeScript. While `@aklinker1/zero-ioc` is intentionally simpler and more opinionated (focusing on singletons, explicit dependencies, and type-safety through TypeScript), Awilix's approach to dependency registration and resolution without decorators was a major influence.

## Feature Comparison

| Feature                         |    Zero IoC    | [Awilix](https://npmx.dev/package/awilix) | [InversifyJS](https://npmx.dev/package/inversify) | [TSyringe](https://npmx.dev/package/tsyringe) | [TypeDI](https://npmx.dev/package/typedi) |
| ------------------------------- | :------------: | :---------------------------------------: | :-----------------------------------------------: | :-------------------------------------------: | :---------------------------------------: |
| Decorators                      |       ❌       |                    ❌                     |                        ✅                         |                      ✅                       |                    ✅                     |
| Require `reflect-metadata`      |       ❌       |                    ❌                     |                        ✅                         |                      ✅                       |                    ✅                     |
| Class-based Services            |       ✅       |                    ✅                     |                        ✅                         |                      ✅                       |                    ✅                     |
| Factory Function-based Services |       ✅       |                    ✅                     |                        ❌                         |                      ❌                       |                    ❌                     |
| Singleton Lifetimes             |       ✅       |                    ✅                     |                        ✅                         |                      ✅                       |                    ✅                     |
| Transient Lifetimes             |       ✅       |                    ✅                     |                        ✅                         |                      ✅                       |                    ✅                     |
| Scoped Lifetimes                |       ✅       |                    ✅                     |                        ✅                         |                      ✅                       |                    ✅                     |
| Circular Dependency Detection   |   ✅ via TS    |                    ❌                     |                  🟡<sup>1</sup>                   |                🟡<sup>2</sup>                 |                    ❌                     |
| Circular Dependency Support     |       ❌       |              🟡<sup>3</sup>               |                        ❌                         |                      ✅                       |                    ❌                     |
| End-to-end Type-safety          |       ✅       |                    ❌                     |                        ❌                         |                      ❌                       |                    ❌                     |
| Async Resolution                | 🟡<sup>4</sup> |          ✅ via `awilix-manager`          |                        ✅                         |                      ❌                       |                    ❌                     |
| Module loader                   |       ❌       |                    ✅                     |                        ❌                         |                      ❌                       |                    ❌                     |
| Dependencies (Subdependencies)  |       0        |                  1 (18)                   |               3 (6) + 1<sup>5</sup>               |               1 + 1<sup>5</sup>               |             0 + 1<sup>5</sup>             |
| Package Size (Install Size)     |    14.4 kB     |            326.6 kB (835.6 kB)            |     32.7 kB (873.7 kB) + 241.2 kB<sup>6</sup>     |  148.6 kB (182.5 kB) + 241.2 kB<sup>6</sup>   |      432.8 kB + 241.2 kB<sup>6</sup>      |

> 1. InversifyJS: [Circular dependencies are detected at runtime, and an error is thrown](https://inversify.io/docs/internals/planning/#6-validation)
> 2. TSyringe: [Circular dependencies are detected at runtime, and an error is thrown](https://github.com/microsoft/tsyringe#circular-dependencies)
> 3. Awilix: [The proxy injection mode can support circular dependencies, but it's not recommended](https://github.com/jeffijoe/awilix#injection-modes)
> 4. Zero IoC: You can use async factory functions, but no promises are awaited automatically. Dependent services should require a `Promise<Service>` instead of just `Service` in their dependencies.
> 5. "+ 1" dependency for `reflect-metadata` peer
> 6. "+ 241.2 kB" install size for `reflect-metadata` peer
