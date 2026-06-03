import { container } from "tsyringe";
import { IHashProvider } from "./HashProvider/IHashProvider";
import { BcryptHashProvider } from "./HashProvider/implementations/BcryptHashProvider";
import { IDateProvider } from "./DateProvider/IDateProvider";
import { DayjsDateProvider } from "./DateProvider/implementations/DayjsDateProvider";

container.registerSingleton<IHashProvider>("HashProvider", BcryptHashProvider);
container.registerSingleton<IDateProvider>("DateProvider", DayjsDateProvider);
