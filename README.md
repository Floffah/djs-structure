# djs-structure

Advanced structure, algorithms, and tools for Discord.JS (v13 and up)

If you aren't planning on using message-based commands and will only use slash commands, you can
create a bot like this

```ts
import {ManagedClient, Module, Command, IncomingCommand} from "djs-structure";

class MyCommand extends Command {
    constructor() {
        super("mycommand", "Description here", [
            // any options here, follows application command option structure, this arg is optional
        ])
    }

    async incoming(i: IncomingCommand) {
        await i.reply("Reply from my command");
    }
}

class MyModule extends Module {
    constructor() {
        super("my-module")
    }

    load() {
        this.registerCommand(new MyCommand());
    }
}

class MyBot extends ManagedClient {
    init() {
        this.initStructure(new MyModule());

        this.login("my-token");
    }
}

const bot = new MyBot();
bot.init();
```

If you do this, commands, modules, and slash commands are all automatically managed for you. If you
want to go more in depth, you can replicate the managed client in [ManagedClient](.
/src/client/ManagedClient) and the typings will allow you to use it as long as it has the
registerCommand and registerModule methods!

If you wanted to add message-based command support that uses the same codebase as your slash
commands, there are built in methods for simulating them. You could do this (typescript):

```ts
import {Message} from "discord.js";
import {IncomingCommand} from "djs-structure";

this.on("messageCreate", async (msg) => {
    // check if it starts with the prefix
    if (msg.content.startsWith("!")) {
        // remove prefix
        let content = msg.content.replace(/^!/, "");

        // match name
        const nameMatches = content.match(/^[A-z0-9]/);
        if (!nameMatches || nameMatches.length <= 0) return;

        const cmd = nameMatches[0];

        content = content.replace(new RegExp(`%${cmd} ?`))
        // ^^^ removes command from content and optional space after

        if (this.commands.has(cmd.toLowercase())) {
            const command = this.commands.get(cmd.toLowercase()) as Command;
            if (!command.opts.supportsMsg) return; // by default this is true

            let deferredMessage: Message | undefined = undefined;

            // only defer if really needs to be, without forcelong this will only apply to slash 
            // commands
            if (command.opts.long && command.opts.forcelong) {
                deferredMessage = await msg.reply("Processing...");
            }

            const incoming = new IncomingCommand({
                type: "message",
                client: this,
                command,
                message: msg,
                content,
                deferredMessage
            });

            try {
                await inc.parseCommand(); // parses arguments into application command options
                await command.incoming(incoming);
            } catch (e) {
                // something went wrong, tell the user
                msg.reply(`${e}`);
            } finally {
                if (command.opts.isPublic === false) await msg.delete();
            }
        }
    }
})
```

If you want to implement your own way to handle incoming commands and emit an incoming event to a
command, see the bottom of [ManagedClient](./src/client/ManagedClient.ts)

More will come in the future!
