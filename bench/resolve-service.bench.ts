import * as Awilix from "awilix";
import * as ZeroIoc from "../src";
import { defineBench } from "./utils";

class Service {}

export default defineBench(
  {
    name: "Resolve service",
  },
  (bench) => {
    const serviceKey = "test";
    const zeroIocContainer = ZeroIoc.createIocContainer().register(
      serviceKey,
      Service,
    );
    const awilixProxyContainer = Awilix.createContainer().register(
      serviceKey,
      Awilix.asClass(Service),
    );
    const awilixClassicContainer = Awilix.createContainer({
      injectionMode: Awilix.InjectionMode.CLASSIC,
    }).register(serviceKey, Awilix.asClass(Service));

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
