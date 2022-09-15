import { MattermostClient } from "../clients";
import {
   getGoogleDocsClient,
   getGoogleDriveClient,
   getGoogleSheetsClient,
   getGoogleSlidesClient
} from "../clients/google-client";
import {
   AppExpandLevels,
   ExceptionType,
   GoogleDriveIcon,
   Routes,
} from "../constant";
import {
   AppCallRequest,
   AppForm,
   MattermostOptions,
} from "../types";
import { throwException, tryPromise } from "../utils/utils";

export async function uploadFileConfirmationCall(call: AppCallRequest): Promise<AppForm> {
   const mattermostUrl: string | undefined = call.context.mattermost_site_url;
   const botAccessToken: string | undefined = call.context.acting_user_access_token;
   const postId: string = call.context.post?.id as string;

   const mattermostOpts: MattermostOptions = {
      mattermostUrl: <string>mattermostUrl,
      accessToken: <string>botAccessToken
   };
   const mmClient: MattermostClient = new MattermostClient(mattermostOpts);

   const Post = await mmClient.getPost(postId);
   const fileIds = Post.file_ids;
   if (!fileIds || !fileIds.length) {
      throwException(ExceptionType.MARKDOWN, `Selected post doesn't have any files to be uploaded`);
   }

   return {
      title: 'Upload to Google Drive',
      header: `Do you want to upload this file to Google Drive?`,
      icon: GoogleDriveIcon,
      fields: [],
      submit: {
         path: Routes.App.CallPathSaveFileSubmit,
         expand: {
            acting_user: AppExpandLevels.EXPAND_SUMMARY,
            acting_user_access_token: AppExpandLevels.EXPAND_ALL,
            oauth2_app: AppExpandLevels.EXPAND_SUMMARY,
            oauth2_user: AppExpandLevels.EXPAND_SUMMARY,
            post: AppExpandLevels.EXPAND_SUMMARY,
         }
      }
   } as AppForm;
}

export async function uploadFileConfirmationSubmit(call: AppCallRequest): Promise<any> {

}