# `@aklinker1/zero-ioc`

[![JSR](https://jsr.io/badges/@aklinker1/zero-ioc)](https://jsr.io/@aklinker1/zero-ioc) [![NPM Version](https://img.shields.io/npm/v/%40aklinker1%2Fzero-ioc?logo=npm&labelColor=red&color=white)](https://www.npmjs.com/package/@aklinker1/zero-ioc) [![Docs](https://img.shields.io/badge/Docs-blue?logo=readme&logoColor=white)](https://jsr.io/@aklinker1/zero-ioc) [![API Reference](https://img.shields.io/badge/API%20Reference-blue?logo=readme&logoColor=white)](https://jsr.io/@aklinker1/zero-ioc/doc) [![License](https://img.shields.io/npm/l/%40aklinker1%2Fzero-ioc)](https://github.com/aklinker1/zero-ioc/blob/main/LICENSE)

Zero dependency, type-safe Inversion of Control (IoC) container. Designed specifically for use with singleton services, as I use in my personal projects.

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
  constructor(deps: { userRepo: UserRepo; db: Database }) {
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

const userService = container.resolve("userService");
```

## Access All Registered Services

To access an object containing all registered services, you can use the readonly `registrations` property:

```ts
const { userRepo, userService } = container.registrations;
```

> This object is actually the same proxy passed as the first argument to factories containing all the available services.

## Register Order

You can only call `register` with a service if you've already registered all of its dependencies. For example, if `userRepo` depends on `db`, you must register `db` in a separate call to `register` before registering `userRepo`.

Good news is TypeScript will tell you if you messed this up! If you haven't registered a dependency, you'll get a type error when you try to register the service that depends on it:

<img width="500" alt="Example type error" src="https://github.com/aklinker1/zero-ioc/raw/main/.github/dependency-type-error.png">

Additionally, thanks to this type-safety, TypeScript will also report an error for circular dependencies!

## Paramaterization

```ts
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
