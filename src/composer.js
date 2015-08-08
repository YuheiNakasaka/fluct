import AWS from 'aws-sdk'
import awsLambda from 'node-aws-lambda'
import { Client } from 'amazon-api-gateway-client'

/**
 * @class
 */
export default class Composer {
  /**
   * @param {String} accessKeyId
   * @param {Application} application
   * @param {Client=} client
   * @param {String} region
   * @param {String} secretAccessKey
   */
  constructor({ accessKeyId, application, client, region, secretAccessKey }) {
    this.accessKeyId = accessKeyId;
    this.application = application;
    this.client = client;
    this.region = region;
    this.secretAccessKey = secretAccessKey;
  }

  /**
   * @param {String} httpMethod
   * @param {String} path
   * @param {Stirng} resourceId
   * @param {Stirng} restapiId
   * @param {String} uri
   * @return {Promise}
   */
  createMethodSet({ httpMethod, path, resourceId, restapiId, uri }) {
    return this.getClient().putMethod({
      httpMethod: httpMethod,
      resourceId: resourceId,
      restapiId: restapiId
    }).then((resource) => {
      return this.getClient().putIntegration({
        httpMethod: httpMethod,
        integrationHttpMethod: 'GET',
        resourceId: resourceId,
        restapiId: restapiId,
        type: 'AWS',
        uri: uri
      });
    }).then((integration) => {
      return this.getClient().putMethodResponse({
        httpMethod: httpMethod,
        resourceId: resourceId,
        restapiId: restapiId,
        statusCode: 200
      });
    }).then(() => {
      return this.getClient().putIntegrationResponse({
        httpMethod: httpMethod,
        resourceId: resourceId,
        restapiId: restapiId,
        statusCode: 200
      });
    });
  }

  /**
   * @param {String} restapiId
   * @return {Promise}
   */
  createResourceSets({ restapiId }) {
    return this.getClient().createResources({
      paths: this.getPaths(),
      restapiId: restapiId
    }).then(() => {
      return Promise.all(
        this.application.getActions().map((action) => {
          return this.getClient().findResourceByPath({
            path: action.getPath(),
            restapiId: restapiId
          }).then((resource) => {
            return this.createMethodSet({
              httpMethod: action.getHttpMethod(),
              path: action.getPath(),
              resourceId: resource.source.id,
              restapiId: restapiId,
              uri: action.getUri()
            });
          });
        })
      );
    });
  }

  /**
   * @return {Promise}
   */
  createRestapi() {
    return this.getClient().createRestapi({
      name: this.application.getName()
    });
  }

  /**
   * @return {Promise}
   */
  createZipFiles() {
    return Promise.all(
      this.application.getActions().map((action) => {
        return action.createZipFile();
      })
    );
  }

  /**
   * @param {String} restapiId
   * @return {Promise}
   */
  deleteDefaultModels({ restapiId }) {
    return Promise.all(
      [
        'Empty',
        'Error'
      ].map((modelName) => {
        return this.getClient().deleteModel({
          modelName: modelName,
          restapiId: restapiId
        });
      })
    );
  }

  /**
   * Set up Amazon Lambda functions and API Gateway endpoints.
   * @return {Promise}
   */
  deploy() {
    return this.createZipFiles().then(() => {
      return this.uploadActions();
    }).then(() => {
      return this.updateActionsMetadata();
    }).then(() => {
      return this.createRestapi();
    }).then((restapi) => {
      return this.deleteDefaultModels({
        restapiId: restapi.source.id
      }).then(() => {
        return restapi;
      });
    }).then((restapi) => {
      return this.createResourceSets({
        restapiId: restapi.source.id
      });
    });
  }

  /**
   * @return {Client}
   */
  getClient() {
    if (!this.client) {
      this.client = new Client({
        accessKeyId: this.accessKeyId,
        region: this.region,
        secretAccessKey: this.secretAccessKey
      });
    }
    return this.client;
  }

  /**
   * @return {Array.<String>}
   */
  getPaths() {
    return this.application.getActions().map((action) => {
      return action.getPath();
    });
  }

  /**
   * @return {Promise}
   */
  updateActionsMetadata() {
    return Promise.all(
      this.application.getActions().map((action) => {
        return new Promise((resolve, reject) => {
          const lambda = new AWS.Lambda({
            region: 'us-east-1'
          });
          lambda.getFunction({ FunctionName: action.getName() }, (error, data) => {
            action.writeArn(data.Configuration.FunctionArn);
            resolve();
          });
        });
      })
    );
  }

  /**
   * @return {Promise}
   */
  uploadActions() {
    return Promise.all(
      this.application.getActions().map((action) => {
        return new Promise((resolve, reject) => {
          awsLambda.deploy(
            `${action.getDirectoryPath()}/dist.zip`,
            {
              functionName: action.getName(),
              handler: action.getHandlerId(),
              region: action.getRegion(),
              role: action.getRole(),
              timeout: action.getTimeout()
            },
            () => {
              console.log(`Uploaded ${action.getName()} function`);
              resolve();
            }
          );
        });
      })
    );
  }

  /**
   * @param {Function} middleware
   * @param {Object=} options
   * @return {Composer}
   */
  use(middleware, options) {
    return new this.constructor({
      accessKeyId: this.accessKeyId,
      application: this.application,
      client: this.getClient().use(middleware, options),
      region: this.region,
      secretAccessKey: this.secretAccessKey
    });
  }
}
