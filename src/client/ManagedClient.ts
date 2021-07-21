import {
    ApplicationCommandData,
    Client,
    ClientOptions,
    Interaction,
} from "discord.js";
import { Command } from "../structure/Command";
import { Module } from "../structure/Module";
import { IncomingCommand } from "../commands/IncomingCommand";

export class ManagedClient extends Client {
    // bot structure
    commands: Map<string, Command> = new Map();
    modules: Map<string, Module> = new Map();

    constructor(opts?: ClientOptions) {
        super({
            intents: ["GUILDS", "GUILD_MESSAGES", "DIRECT_MESSAGES"],
            partials: ["MESSAGE"],
            ...(opts ?? {}),
        });

        this.on("ready", () => this.onReady());
        this.on("interactionCreate", (i) => this.onInteraction(i));
    }

    registerModule(m: Module) {
        m.client = this;
        this.modules.set(m.name, m);
        m.load();
    }

    registerCommand(m: Module, c: Command) {
        c.module = m;
        this.commands.set(c.name, c);
        m.commands.push(c.name);
    }

    async initStructure(modules: Module[]) {
        for (const module of modules) this.registerModule(module);
    }

    async onReady() {
        const commands: ApplicationCommandData[] = [];

        for (const c of this.commands.values()) {
            if (c.opts.supportsSlash) commands.push(await c.get());
        }

        await this.application?.commands.set(commands);

        for (const m of this.modules.values()) {
            m.ready();
        }
    }

    async onInteraction(i: Interaction) {
        if (i.isCommand() && i.command && this.commands.has(i.command.name)) {
            const cmd = this.commands.get(i.command.name) as Command;
            if (!cmd.opts.supportsSlash) return;

            if (cmd.opts.long)
                await i.defer({
                    ephemeral: !cmd.opts.isPublic,
                });

            const inc = new IncomingCommand({
                type: "interaction",
                rawInteraction: i,
                client: this,
                command: cmd,
                deferred: cmd.opts.long,
            });

            try {
                await cmd.incoming(inc);
            } catch (e) {
                console.error(e);
                if (i.replied) i.channel?.send(`${e}`);
                else i.reply(`${e}`);
            }
        }
    }
}
