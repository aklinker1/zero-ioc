import * as Awilix from "awilix";
import * as ZeroIoc from "../src";
import { defineBench } from "./utils";

class Service {}

export default defineBench(
  {
    name: "Resolve transient service",
  },
  (bench) => {
    const serviceKey = "test";
    const zeroIocContainer = ZeroIoc.createIocContainer().register(
      serviceKey,
      ZeroIoc.transient(Service),
    );
    const awilixProxyContainer = Awilix.createContainer().register(
      serviceKey,
      Awilix.asClass(Service, { lifetime: Awilix.Lifetime.TRANSIENT }),
    );
    const awilixClassicContainer = Awilix.createContainer({
      injectionMode: Awilix.InjectionMode.CLASSIC,
    }).register(
      serviceKey,
      Awilix.asClass(Service, { lifetime: Awilix.Lifetime.TRANSIENT }),
    );

    bench
      .add("@aklinker1/zero-ioc", () => {
        zeroIocContainer.resolve(serviceKey);
      })
      .add("awilix (proxy)", () => {
        awilixProxyContainer.resolve(serviceKey);
      })
      .add("awilix (classic)", () => {
        awilixClassicContainer.resolve(serviceKey);
      });
  },
);
