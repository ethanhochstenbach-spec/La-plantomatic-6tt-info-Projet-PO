import "dotenv/config";
import {
  Client,
  GatewayIntentBits,
  EmbedBuilder
} from "discord.js";
import { execFile } from "child_process";

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

const {
  DISCORD_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  COMMIT_CHANNEL_ID
} = process.env;

let lastCommitSha = null;

const githubUrl =
  `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?per_page=1`;

// ======================================================
// Requête GitHub
// ======================================================

async function githubRequest(url) {
  const response = await fetch(url, {
    headers: {
      "Accept": "application/vnd.github+json",
      "User-Agent": "Discord-GitHub-Bot"
    }
  });

  const text = await response.text();

  if (!response.ok) {
    throw new Error(
      `GitHub HTTP ${response.status} ${response.statusText} - ${text}`
    );
  }

  return JSON.parse(text);
}

// ======================================================
// Vérification des commits
// ======================================================

async function checkGitHub() {
  try {
    // Récupérer le dernier commit
    const commits = await githubRequest(githubUrl);

    if (!Array.isArray(commits) || commits.length === 0) {
      console.error("Aucun commit trouvé.");
      return;
    }

    const commit = commits[0];

    // Premier lancement
    if (lastCommitSha === null) {
      lastCommitSha = commit.sha;

      console.log(
        `Commit initial mémorisé : ${commit.sha.substring(0, 7)}`
      );

      return;
    }

    // Aucun nouveau commit
    if (commit.sha === lastCommitSha) {
      console.log("Aucun nouveau commit.");
      return;
    }

    // Nouveau commit
    lastCommitSha = commit.sha;

    console.log(
      `Nouveau commit détecté : ${commit.sha.substring(0, 7)}`
    );

    // ==================================================
    // Récupérer les détails du commit
    // ==================================================

    const commitDetailsUrl =
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits/${commit.sha}`;

    const details = await githubRequest(commitDetailsUrl);

    const commitChannel =
      await client.channels.fetch(COMMIT_CHANNEL_ID);

    // ==================================================
    // Informations
    // ==================================================

    const author =
      details.commit?.author?.name ||
      details.author?.login ||
      "Inconnu";

    const date = details.commit?.author?.date
      ? new Date(details.commit.author.date)
      : new Date();

    const message =
      details.commit?.message ||
      "Aucun message";

    const files = details.files || [];

    // ==================================================
    // Fichiers modifiés
    // ==================================================

    let filesText = "";

    if (files.length === 0) {
      filesText = "Aucun fichier disponible";
    } else {
      filesText = files
        .slice(0, 15)
        .map((file) => {
          let icon = "📝";

          if (file.status === "added") {
            icon = "🟢";
          } else if (file.status === "removed") {
            icon = "🔴";
          } else if (file.status === "modified") {
            icon = "🟡";
          } else if (file.status === "renamed") {
            icon = "🔵";
          }

          return (
            `${icon} \`${file.filename}\` **${file.status}** ` +
            `(+${file.additions}/-${file.deletions})`
          );
        })
        .join("\n");

      if (files.length > 15) {
        filesText +=
          `\n... et **${files.length - 15}** autre(s) fichier(s).`;
      }
    }

    // ==================================================
    // Embed Discord
    // ==================================================

    const embed = new EmbedBuilder()
      .setColor(0x2ea44f)
      .setTitle("🚀 Nouveau commit GitHub")
      .setURL(details.html_url)
      .setDescription(
        `**${message}**\n\n` +
        `🔗 [Voir le commit sur GitHub](${details.html_url})`
      )
      .addFields(
        {
          name: "👤 Modifié par",
          value: author,
          inline: true
        },
        {
          name: "🔖 Commit",
          value: `\`${details.sha.substring(0, 7)}\``,
          inline: true
        },
        {
          name: "📦 Repository",
          value: `${GITHUB_OWNER}/${GITHUB_REPO}`,
          inline: true
        },
        {
          name: "📅 Date",
          value: `<t:${Math.floor(date.getTime() / 1000)}:F>`,
          inline: false
        },
        {
          name: `📁 Fichiers modifiés (${files.length})`,
          value: filesText.substring(0, 1024),
          inline: false
        }
      )
      .setFooter({
        text: "GitHub Commit Bot"
      })
      .setTimestamp(date);

    await commitChannel.send({
      embeds: [embed]
    });

    console.log(
      `Commit ${details.sha.substring(0, 7)} envoyé sur Discord.`
    );

  } catch (error) {
    console.error("Erreur GitHub :", error);
  }
}

// ======================================================
// Bot prêt
// ======================================================

client.once("clientReady", async () => {
  console.log(`Connecté en tant que ${client.user.tag}`);

  // Déployer les commandes à chaque démarrage
  execFile(
    "node",
    ["deploy-commands.js"],
    (error, stdout, stderr) => {
      if (error) {
        console.error(
          "Erreur deploy-commands.js :",
          error
        );
        return;
      }

      if (stdout) {
        console.log(stdout);
      }

      if (stderr) {
        console.error(stderr);
      }
    }
  );

  // Vérification immédiate
  await checkGitHub();

  // Vérification toutes les 2 minutes
  setInterval(
    checkGitHub,
    2 * 60 * 1000
  );
});

// ======================================================
// Connexion Discord
// ======================================================

client.login(DISCORD_TOKEN);
