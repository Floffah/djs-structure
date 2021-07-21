import { ApplicationCommandData, ApplicationCommandOption } from "discord.js";
import { Module } from "./Module";
import { IncomingCommand } from "../commands/IncomingCommand";

export interface CommandOptions {
    long?: boolean;
    isPublic?: boolean;
    forceLong?: boolean;
    supportsSlash?: boolean;
    supportsMsg?: boolean;
}

export class Command {
    name: string;
    description: string;
    options: ApplicationCommandOption[];
    module: Module;
    opts: CommandOptions & { supportsSlash: boolean; supportsMsg: boolean };
    isGrouped = false;

    constructor(
        name: string,
        description: string,
        options?: ApplicationCommandOption[],
        opts?: CommandOptions,
    ) {
        this.name = name;
        this.description = description;
        this.options = options ?? [];

        // makes sure defaults are there
        this.opts = {
            long: true,
            isPublic: true,
            forceLong: false,
            supportsMsg: true,
            supportsSlash: true,
            ...opts,
        };

        for (const opt of this.options) {
            if (opt.type === "SUB_COMMAND") {
                this.isGrouped = true;
                break;
            }
        }
    }

    async get(): Promise<ApplicationCommandData> {
        return {
            name: this.name,
            description: this.description,
            options: this.options,
        };
    }

    incoming(_i: IncomingCommand) {
        // incoming
    }
}
