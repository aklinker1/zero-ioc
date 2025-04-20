import { createIocContainer, parameterize } from "..";

// SERVICES

type User = { id: string; name: string };

type Database = {
  query: () => User[];
};
function openDatabase(): Database {
  throw Error("TODO");
}
function openDatabase2(_deps: { path: string }): Database {
  throw Error("TODO");
}

type UserRepo = {
  get: (id: string) => User;
  create: (user: Omit<User, "id">) => User;
};
function createUserRepo(_deps: { db: Database }): UserRepo {
  throw Error("TODO");
}

type OtherDep = {};
function createOtherDep(): OtherDep {
  throw Error("TODO");
}

type UserService = {
  createAccount: (name: string) => void;
};
function createUserService(_deps: {
  db: Database;
  userRepo: UserRepo;
  other: OtherDep;
}): UserService {
  throw Error("TODO");
}

// Type Tests

const containerA = createIocContainer()
  .register({
    db: openDatabase,
    other: createOtherDep,
  })
  .register({
    userRepo: createUserRepo,
  })
  .register({
    userService: createUserService,
  });
containerA.resolve("userService");

createIocContainer().register({
  db: openDatabase,
  // @ts-expect-error: userRepo needs to be registered in a separate call to "register"
  userRepo: createUserRepo,
});

createIocContainer()
  .register({
    database: openDatabase,
  })
  .register({
    // @ts-expect-error: userRepo needs database to be registered as "db", not "database"
    userRepo: createUserRepo,
  });

createIocContainer()
  .register({ db: parameterize(openDatabase2, { path: "test.db" }) })
  .registrations.db.query();

createIocContainer()
  // @ts-expect-error: Parameterize should require "path" here
  .register({ db: parameterize(openDatabase2, {}) })
  .registrations.db.query();
