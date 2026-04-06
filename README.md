<div align="center">

# `@aklinker1/zero-ioc`

[![JSR](https://jsr.io/badges/@aklinker1/zero-ioc)](https://jsr.io/@aklinker1/zero-ioc) [![NPM Version](https://img.shields.io/npm/v/%40aklinker1%2Fzero-ioc?logo=npm&labelColor=red&color=white)](https://www.npmjs.com/package/@aklinker1/zero-ioc) [![Docs](https://img.shields.io/badge/Docs-blue?logo=readme&logoColor=white)](https://jsr.io/@aklinker1/zero-ioc) [![API Reference](https://img.shields.io/badge/API%20Reference-blue?logo=readme&logoColor=white)](https://jsr.io/@aklinker1/zero-ioc/doc) [![License](https://img.shields.io/npm/l/%40aklinker1%2Fzero-ioc)](https://github.com/aklinker1/zero-ioc/blob/main/LICENSE)

Zero dependency, type-safe, decorator-free Inversion of Control (IoC) container.

</div>

## Usage

Define your services. You can use classes or factory functions:

- Class constructors can only accept a single argument, which is an object with the dependencies
- Factory functions can only accept a single argument, which is an object with the dependencies

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
  .register({ db: openDatabase })
  .register({ userRepo: createUserRepo })
  .register({ userService: UserService });
```

And finally, to get an instance of a service from the container, use `resolve`:

```ts
const userService = container.resolve("userService");
```

## Register Order

You can only call `register` with a service if you've already registered all of its dependencies. For example, if `userRepo` depends on `db`, you must register `db` **_in a separate call to `register`_** before registering `userRepo`.

The good news is TypeScript will tell you if you messed this up! If you haven't registered a dependency, you'll get a type error when you try to register the service that depends on it:

<img width="500" alt="Example type error" src="https://raw.githubusercontent.com/aklinker1/zero-ioc/main/.github/dependency-type-error.png">

Additionally, thanks to this type-safety, TypeScript will also report an error for circular dependencies!

## Access All Registered Services

To access an object containing all registered services, you have two options:

1. `container.registrations`: Returns a proxy object that resolves services lazily when you access them.
   ```ts
   const { userRepo, userService } = container.registrations;
   ```
2. `container.resolveAll()`: Immediately resolves all registered services and returns them as a plain object, no proxy magic. Useful when passing services to a third-party library that doesn't support proxies.
   ```ts
   const { userRepo, userService } = container.resolveAll();
   ```

## Parameterization

Sometimes you need to pass additional parameters to a service, like config, that aren't previously registered services.

In this case, use `parameterize`. Any parameters passed in via the second argument don't need to be registered beforehand!

```ts
import { createIocContainer, parameterize } from "@aklinker1/zero-ioc";

const openDatabase = (deps: {
  username: string;
  password: string;
}): Database => {
  // ...
};

const container = createIocContainer().register({
  db: parameterize(openDatabase, {
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
  }),
});
```

## Service Lifetime

### Singleton

`createIocContainer` only manages singleton services. Once your service has been resolved, it will be cached and the same instance will be returned on subsequent calls.

```ts
interface UserRepo {
  // ...
}
function createUserRepo() {
  return {
    // ...
  };
}

const container = createIocContainer().register({
  userRepo: createUserRepo,
});

const userRepo1 = container.resolve("userRepo");
const userRepo2 = container.resolve("userRepo");
console.log(userRepo1 === userRepo2); // true
```

### Transient

A "transient" service is a service that is created every time it is resolved. Use the `transient` helper to inform the container that your service should be created each time:

```ts
import { createIocContainer, transient } from '@aklinker1/zero-ioc';

interface UserRepo {
  // ...
}

function createUserRepo(): UserRepo {
  console.log("Creating new UserRepo");

  return {
    // ...
  };
}

const container = createIocContainer().register({
  userRepoFactory: transient(createUserRepoFactory),
});

const userRepo1 = container.resolve("userRepo");
const userRepo2 = container.resolve("userRepo");
console.log(userRepo1 === userRepo2); // false
```

Note that when using `container.resolveAll()`, you're resolving all dependencies immediately, and any transient services will be created once.

If you need to create an instance every time, you can either:

1. Use the `container.registrations` proxy, which will return a new instance on every access.
2. Don't use `transient`. Instead, register a function that returns your instance:
   ```ts
   container.register("userRepoFactory", () => createUserRepo);
   const userRepoFactory = container.resolve("userRepoFactory");
   const userRepo1 = userRepoFactory();
   const userRepo2 = userRepoFactory();
   console.log(userRepo1 === userRepo2); // false
   ```

### Scoped

"Scoped" services are services that are created once per "scope". Zero IoC does not currently support creating "scopes", and thus does not support scoped services.

> If someone has a good proposal that keeps the API simple, I'd be happy to consider adding support.

<br />

## Inspiration

This library was heavily inspired by [Awilix](https://github.com/jeffijoe/awilix), a powerful IoC container for JavaScript/TypeScript. While `@aklinker1/zero-ioc` is intentionally simpler and more opinionated (focusing on singletons, explicit dependencies, and type-safety through TypeScript), Awilix's approach to dependency registration and resolution without decorators was a major influence.
