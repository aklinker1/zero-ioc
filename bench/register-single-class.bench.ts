import * as Awilix from "awilix";
import * as ZeroIoc from "../src";
import { defineBench } from "./utils";

class Service {}
const classicOptions = {
  injectionMode: Awilix.InjectionMode.CLASSIC,
};
const serviceKey = "test";

export default defineBench(
  {
    name: "Register single class",
  },
  (bench) => {
    bench
      .add("@aklinker1/zero-ioc", () => {
        ZeroIoc.createIocContainer().register(serviceKey, Service);
      })
      .add("awilix (proxy)", () => {
        Awilix.createContainer().register(serviceKey, Awilix.asClass(Service));
      })
      .add("awilix (classic)", () => {
        Awilix.createContainer(classicOptions).register(
          serviceKey,
          Awilix.asClass(Service),
        );
      });
  },
);
