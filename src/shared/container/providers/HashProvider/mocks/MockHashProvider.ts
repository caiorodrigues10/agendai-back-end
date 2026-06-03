import { IHashProvider } from "../IHashProvider";

export class MockHashProvider implements IHashProvider {
  async hash(payload: string): Promise<string> {
    return `hashed:${payload}`;
  }
  async compare(payload: string, hashed: string): Promise<boolean> {
    return hashed === `hashed:${payload}`;
  }
}
