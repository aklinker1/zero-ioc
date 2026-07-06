import * as Awilix from "awilix";
import * as ZeroIoc from "../src";
import { defineBench } from "./utils";

const factory = () => ({});
const classicOptions = {
  injectionMode: Awilix.InjectionMode.CLASSIC,
};
const serviceKey = "test";

export default defineBench(
  {
    name: "Register single factory function",
  },
  (bench) => {
    bench
      .add("@aklinker1/zero-ioc", () => {
        ZeroIoc.createIocContainer().register(serviceKey, factory);
      })
      .add("awilix (proxy)", () => {
        Awilix.createContainer().register(
          serviceKey,
          Awilix.asFunction(factory),
        );
      })
      .add("awilix (classic)", () => {
        Awilix.createContainer(classicOptions).register(
          serviceKey,
          Awilix.asFunction(factory),
        );
      });
  },
);
