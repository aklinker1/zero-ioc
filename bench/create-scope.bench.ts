import * as Awilix from "awilix";
import * as ZeroIoc from "../src";
import { defineBench } from "./utils";

const databaseKey = "database";
interface Database {}
function openDatabase(): Database {
  return {};
}

const requestKey = "request";
const request = new Request("https://localhost");

const authServiceKey = "authService";
class AuthService {
  constructor(private deps: { database: Database; request: Request }) {}
}

export default defineBench({ name: "Create Scope" }, (bench) => {
  const zeroIocContainer = ZeroIoc.createIocContainer().register(
    databaseKey,
    openDatabase,
  );
  const zeroIocScope = zeroIocContainer
    .scope<{ request: Request }>()
    .register(authServiceKey, AuthService);

  const awilixContainer = Awilix.createContainer()
    .register(databaseKey, Awilix.asFunction(openDatabase))
    .register(authServiceKey, Awilix.asClass(AuthService));

  const classicAwilixContainer = Awilix.createContainer({
    injectionMode: Awilix.InjectionMode.CLASSIC,
  })
    .register(databaseKey, Awilix.asFunction(openDatabase))
    .register(authServiceKey, Awilix.asClass(AuthService));

  bench
    .add("@aklinker1/zero-ioc", () => {
      zeroIocScope({ request }).resolveAll();
    })
    .add("awilix (proxy)", () => {
      void awilixContainer
        .createScope()
        .register(requestKey, Awilix.asValue(request)).registrations;
    })
    .add("awilix (classic)", () => {
      void classicAwilixContainer
        .createScope()
        .register(requestKey, Awilix.asValue(request)).registrations;
    });
});
