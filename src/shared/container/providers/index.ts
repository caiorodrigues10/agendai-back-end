import { container } from "tsyringe";
import { IHashProvider }    from "./HashProvider/IHashProvider";
import { BcryptHashProvider } from "./HashProvider/implementations/BcryptHashProvider";
import { IDateProvider }    from "./DateProvider/IDateProvider";
import { DayjsDateProvider } from "./DateProvider/implementations/DayjsDateProvider";
import { IStorageProvider } from "./StorageProvider/IStorageProvider";
import { GcsStorageProvider } from "./StorageProvider/implementations/GcsStorageProvider";
import { IEmailProvider } from "./EmailProvider/IEmailProvider";
import { ResendEmailProvider } from "./EmailProvider/implementations/ResendEmailProvider";

container.registerSingleton<IHashProvider>   ("HashProvider",    BcryptHashProvider);
container.registerSingleton<IDateProvider>   ("DateProvider",    DayjsDateProvider);
container.registerSingleton<IStorageProvider>("StorageProvider", GcsStorageProvider);
container.registerSingleton<IEmailProvider>  ("EmailProvider",   ResendEmailProvider);
