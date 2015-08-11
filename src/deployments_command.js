import AWS from 'aws-sdk'
import Application from './application'
import BaseCommand from './base_command'
import moment from 'moment'
import { Client } from 'amazon-api-gateway-client'

/**
 * @class
 */
export default class RoutesCommand extends BaseCommand {
  run() {
    const application = new Application();
    console.log(`=== ${application.getName()} deployments`);
    new Client({
      accessKeyId: AWS.config.credentials.accessKeyId,
      region: 'us-east-1',
      secretAccessKey: AWS.config.credentials.secretAccessKey
    }).listDeployments({ restapiId: application.getRestapiId() }).then((deployments) => {
      console.log(
        deployments.map((deployment) => {
          return `${deployment.source.id}  ${moment.unix(deployment.source.createdDate).format('YYYY-MM-DD HH:mm Z')}`;
        }).join('\n')
      );
    });
  }
}
