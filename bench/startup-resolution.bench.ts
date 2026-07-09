import * as Awilix from "awilix";
import * as ZeroIoc from "../src";
import { defineBench } from "./utils";

const databaseKey = "database";
interface Database {}
function openDatabase(): Database {
  return {};
}

const userRepoKey = "userRepo";
class UserRepo {
  constructor(private deps: { database: Database }) {}
}

const userServiceKey = "userService";
class UserService {
  constructor(private deps: { database: Database; userRepo: UserRepo }) {}
}

const classicOptions = {
  injectionMode: Awilix.InjectionMode.CLASSIC,
};

export default defineBench({ name: "Startup Resolution" }, (bench) => {
  bench
    .add("@aklinker1/zero-ioc", () => {
      void ZeroIoc.createIocContainer()
        .register(databaseKey, openDatabase)
        .register(userRepoKey, UserRepo)
        .register(userServiceKey, UserService)
        .resolveAll();
    })
    .add("awilix (proxy)", () => {
      void Awilix.createContainer()
        .register(databaseKey, Awilix.asFunction(openDatabase))
        .register(userRepoKey, Awilix.asClass(UserRepo))
        .register(userServiceKey, Awilix.asClass(UserService)).registrations;
    })
    .add("awilix (classic)", () => {
      void Awilix.createContainer(classicOptions)
        .register(databaseKey, Awilix.asFunction(openDatabase))
        .register(userRepoKey, Awilix.asClass(UserRepo))
        .register(userServiceKey, Awilix.asClass(UserService)).registrations;
    });
});
