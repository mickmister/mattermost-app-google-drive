import {
    AppCallRequest, 
    AppCallValues, 
    GoogleTokenResponse, 
    KVGoogleData, 
    KVGoogleUser, 
    KVStoreOptions, 
    Oauth2App,
    Oauth2CurrentUser,
    Schema$About,
} from '../types';
import { KVStoreClient } from '../clients/kvstore';
import { ExceptionType } from '../constant';
import { getGoogleOAuthScopes } from '../utils/oauth-scopes';
import { isConnected, tryPromise } from '../utils/utils';
import { hyperlink } from '../utils/markdown';
import { Exception } from '../utils/exception';
import { postBotChannel } from '../utils/post-in-channel';
import { getGoogleDriveClient, getOAuthGoogleClient } from '../clients/google-client';
const { google } = require('googleapis');

export async function getConnectLink(call: AppCallRequest): Promise<string> {
    const connectUrl: string = call.context.oauth2?.connect_url as string;
    const oauth2: Oauth2App | undefined = call.context.oauth2 as Oauth2App;
    const message: string = isConnected(oauth2)
        ? `You are already logged into Google`
        : `Follow this ${hyperlink('link', connectUrl)} to connect Mattermost to your Google Account.`;
    return message;
}

export async function oAuth2Connect(call: AppCallRequest): Promise<string> {
    const oauth2App: Oauth2App = call.context.oauth2 as Oauth2App;
    const state: string = call.values?.state as string;

    const oAuth2Client = new google.auth.OAuth2(
        oauth2App.client_id,
        oauth2App.client_secret,
        oauth2App?.complete_url
    );

    const scopes = getGoogleOAuthScopes();

    return oAuth2Client.generateAuthUrl({
        scope: scopes,
        state: state,
        access_type: 'offline'
    });
}

export async function oAuth2Complete(call: AppCallRequest): Promise<void> {
    const mattermostUrl: string | undefined = call.context.mattermost_site_url;
    const botAccessToken: string | undefined = call.context.bot_access_token;
    const accessToken: string | undefined = call.context.acting_user_access_token;
    const userID: string | undefined = call.context.acting_user?.id;
    const values: AppCallValues | undefined = call.values;

    if (!values?.code) {
        throw new Error(values?.error_description || 'Bad Request: code param not provided');
    }

    const oAuth2Client = await getOAuthGoogleClient(call);
    const tokenBody: GoogleTokenResponse = await oAuth2Client.getToken(values?.code);
    const oauth2Token: Oauth2CurrentUser = {
        refresh_token: <string>tokenBody.tokens?.refresh_token,
    }

    call.context.oauth2.user = oauth2Token;

    const drive = await getGoogleDriveClient(call);
    const aboutParams = {
        fields: 'user'
    }
    const aboutUser = await tryPromise<Schema$About>(drive.about.get(aboutParams), ExceptionType.TEXT_ERROR, 'Google failed: ');

    const storedToken: Oauth2CurrentUser = {
        refresh_token: <string>tokenBody.tokens?.refresh_token,
        user_email: <string>aboutUser.user.emailAddress
    };
    console.log(storedToken);

    const kvOptionsOauth: KVStoreOptions = {
        mattermostUrl: <string>mattermostUrl,
        accessToken: <string>accessToken
    };
    const kvStoreClientOauth = new KVStoreClient(kvOptionsOauth);
    await kvStoreClientOauth.storeOauth2User(storedToken);

    const kvOptions: KVStoreOptions = {
        mattermostUrl: <string>mattermostUrl,
        accessToken: <string>botAccessToken
    };
    const kvStoreClient = new KVStoreClient(kvOptions);
    const kvGoogleData: KVGoogleData = await kvStoreClient.kvGet('google_data');
    const googleUser: KVGoogleUser = {
        [<string>userID]: storedToken
    }
    const googleData: KVGoogleData = {
        userData: !!kvGoogleData?.userData?.length ? kvGoogleData.userData : []
    }
    googleData.userData.push(googleUser);
    await kvStoreClient.kvSet('google_data', googleData);

    const message = 'You have successfully connected your Google account!';
    await postBotChannel(call, message);
}

export async function oAuth2Disconnect(call: AppCallRequest): Promise<void> {
    const mattermostUrl: string | undefined = call.context.mattermost_site_url;
    const accessToken: string | undefined = call.context.acting_user_access_token;
    const botAccessToken: string | undefined = call.context.bot_access_token;
    const userID: string | undefined = call.context.acting_user?.id;
    const oauth2: Oauth2App | undefined = call.context.oauth2 as Oauth2App;
    
    if (!isConnected(oauth2)) {
        throw new Exception(ExceptionType.MARKDOWN, 'Impossible to disconnet. There is no active session');
    }

    const kvOptionsOauth: KVStoreOptions = {
        mattermostUrl: <string>mattermostUrl,
        accessToken: <string>accessToken
    };
    const kvStoreClientOauth = new KVStoreClient(kvOptionsOauth);
    await kvStoreClientOauth.storeOauth2User({});

    const kvOptions: KVStoreOptions = {
        mattermostUrl: <string>mattermostUrl,
        accessToken: <string>botAccessToken
    };
    const kvStoreClient = new KVStoreClient(kvOptions);

    const googleData: KVGoogleData = await kvStoreClient.kvGet('google_data');
    const remove = googleData.userData.findIndex(user => Object.keys(user)[0] === <string>userID);
    if (remove >= 0) {
        googleData.userData.splice(remove, 1);
    }
    await kvStoreClient.kvSet('google_data', googleData);

    const message = 'You have successfully disconnected your Google account!';
    await postBotChannel(call, message);
}