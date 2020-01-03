const q = require('daskeyboard-applet');
const axios = require('axios').default;
const logger = q.logger;
const pollingInterval = 30000;

class DevOps extends q.DesktopApp {
  constructor() {
    super();
    this.pollingInterval = pollingInterval;
    logger.info('DevOps loaded');
  }

  async applyConfig() {
    logger.info('Applying config');
    this.cfg = {
      emptyColor: '#000000',
      failureColor: '#FF0000',
      successColor: '#00FF00',
      workingColor: '#0000FF',
      coreServer: 'dev.azure.com',
      organization: this.config.organization,
      project: this.config.project,
      repository: this.config.repository,
      apiVersion: '5.1',
      accessToken: this.config.accessToken,
      userId: this.config.userId,
      buildDefinitions: this.config.buildDefinitions,
      releaseDefinition: this.config.releaseDefinition,
      releaseEnvironment: this.config.releaseEnvironment
    };
    const base64Token = Buffer.from(`Basic:${this.cfg.accessToken}`).toString(
      'base64'
    );
    axios.defaults.headers = {
      Authorization: `Basic ${base64Token}`,
      'Content-Type': 'application/json'
    };
    axios.defaults.params = {
      'api-version': this.cfg.apiVersion
    };
    return true;
  }

  async run() {
    const prCount = await this.getPRCount();
    const latestBuild = await this.getLatestBuild();
    const latestRelease = await this.getLatestRelease();
    const messages = [];
    const points = [
      new q.Point(this.cfg.emptyColor),
      new q.Point(this.cfg.emptyColor),
      new q.Point(this.cfg.emptyColor)
    ];
    if (prCount > 0) {
      points[0] = new q.Point(this.cfg.workingColor);
      messages.push(`${prCount} PRs awaiting review.`);
    }
    if (latestBuild) {
      if (latestBuild.status === 'completed') {
        if (latestBuild.result === 'succeeded') {
          points[1] = new q.Point(this.cfg.successColor);
          messages.push(`Last build succeeded.`);
        } else {
          points[1] = new q.Point(this.cfg.failureColor);
          messages.push(`Last build failed.`);
        }
      } else if (latestBuild.status === 'notStarted') {
        points[1] = new q.Point(this.cfg.workingColor);
        messages.push(`Build in queue.`);
      } else if (latestBuild.status === 'inProgress') {
        points[1] = new q.Point(this.cfg.workingColor, 'BLINK');
        messages.push(`Build in progress.`);
      }
    }
    if (latestRelease) {
      const release = latestRelease.environments.find(
        env => env.name === this.cfg.releaseEnvironment
      );
      logger.info(release.id);
      if (release) {
        if (release.status === 'notStarted') {
          points[2] = new q.Point(this.cfg.workingColor);
          messages.push('Last release not started.');
        }
        if (release.status === 'inProgress') {
          points[2] = new q.Point(this.cfg.workingColor, 'BLINK');
          messages.push('Last release in progress.');
        } else if (release.status === 'rejected') {
          points[2] = new q.Point(this.cfg.failureColor);
          messages.push('Last release failed.');
        } else if (release.status === 'succeeded') {
          points[2] = new q.Point(this.cfg.successColor);
          messages.push('Last release succeeded.');
        }
      }
    }
    logger.info(`DevOps finished with: ${messages.join('')}`);
    return new q.Signal({
      points: [points],
      name: 'Azure DevOps',
      message: messages.length > 0 ? messages.join(' ') : undefined
    });
  }

  async getLatestRelease() {
    const resp = await axios.get(
      `https://vsrm.${this.cfg.coreServer}/${this.cfg.organization}/${this.cfg.project}/_apis/release/releases`,
      {
        params: {
          $top: 1,
          definitionId: parseInt(this.cfg.releaseDefinition)
        }
      }
    );

    if (resp.status === 200 && resp.data.value.length > 0) {
      const releaseId = resp.data.value[0].id;
      const release = await axios.get(
        `https://vsrm.${this.cfg.coreServer}/${this.cfg.organization}/${this.cfg.project}/_apis/release/releases/${releaseId}`
      );
      if (release.status === 200) {
        return release.data;
      }
    }
    return null;
  }

  async getLatestBuild() {
    const resp = await axios.get(
      `https://${this.cfg.coreServer}/${this.cfg.organization}/${this.cfg.project}/_apis/build/builds`,
      {
        params: {
          requestedFor: this.cfg.userId,
          definitions: this.cfg.buildDefinitions,
          $top: 1
        }
      }
    );
    if (resp.status === 200 && resp.data.value.length > 0) {
      return resp.data.value[0];
    } else {
      return null;
    }
  }

  async getPRCount() {
    const resp = await axios.get(
      `https://${this.cfg.coreServer}/${this.cfg.organization}/${this.cfg.project}/_apis/git/repositories/${this.cfg.repository}/pullrequests`,
      {
        params: {
          'searchCriteria.reviewerId': this.cfg.userId
        }
      }
    );
    if (resp.data && resp.data.value) {
      return resp.data.value.length;
    } else {
      return 0;
    }
  }
}

module.exports = {
  DevOps
};

/* eslint-disable */
const applet = new DevOps();
/* eslint-enable */
