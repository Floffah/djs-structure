import { Command } from "./Command";
import { ManagedClient } from "../client/ManagedClient";
import { ManagableClient } from "../client/ManagableClient";

export class Module {
    commands: string[] = [];

    name: string;
    client: ManagedClient | ManagableClient;

    constructor(name: string) {
        this.name = name;
    }

    registerCommand(c: Command) {
        this.client.registerCommand(this, c);
    }

    load() {
        // load
    }

    ready() {
        // ready
    }
}
