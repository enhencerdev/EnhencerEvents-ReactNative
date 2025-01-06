import { Platform } from "react-native";
import { MMKV } from 'react-native-mmkv';
import { AppEventsLogger } from 'react-native-fbsdk-next';
import analytics from '@react-native-firebase/analytics';

const storage = new MMKV();

export default class {
  constructor(token) {
    this.userID = token;
    this.visitorID = null;
    this.type = "ecommerce";
    this.deviceType = Platform.OS;
    this.domain = process.env.NODE_ENV === "production" ? "https://collect-app.enhencer.com/api/" : "http://localhost:8080/api/"
    this.listingUrl = this.domain + "listings/";
    this.productUrl = this.domain + "products/";
    this.purchaseUrl = this.domain + "purchases/";
    this.customerUrl = this.domain + "customers/";
    this.setVisitorID();
  }

  config (token){
    this.userID = token;
  }

  setVisitorID = async () => {
    try {
        const storedVisitorID = storage.getString("enh_visitor_id");
        if (!storedVisitorID) {
            this.visitorID = this.generateVisitorID();
            storage.set("enh_visitor_id", this.visitorID);
        } else {
            this.visitorID = storedVisitorID;
        }
    } catch (error) {
        console.error("VisitorID setting error:", error);
        this.visitorID = this.generateVisitorID();
    }
  };

  generateVisitorID = () => {
    const letters =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    return Array(8)
      .fill()
      .map(() => letters.charAt(Math.floor(Math.random() * letters.length)))
      .join("");
  };


  listingPageView = (category) => {
    this.ensureVisitorID();
    let parameters = JSON.stringify({
      type: this.type,
      visitorID: this.visitorID,
      productCategory1: category,
      productCategory2: "",
      deviceType: this.deviceType,
      userID: this.userID,
      id: this.visitorID,
      actionType: "listing",
    });
    
    this.sendRequest(parameters, this.listingUrl, "POST")
    this.sendRequest(parameters, this.customerUrl, "POST");

    this.scoreMe();
  }

  productPageView = async (productID, productCategory, productPrice) => {
    await this.ensureVisitorID();
    let parameters = JSON.stringify({
      type: this.type,
      visitorID: this.visitorID,
      productID,
      productCategory2: productCategory,
      price: productPrice,
      deviceType: this.deviceType,
      actionType: "product",
      userID: this.userID,
      id: this.visitorID,
    });

    this.sendRequest(parameters, this.productUrl, "POST");
    this.sendRequest(parameters, this.customerUrl, "POST");

    this.scoreMe();
  }

  addedToCart = async (productID) => {
    await this.ensureVisitorID();
    let parameters = JSON.stringify({
      type: this.type,
      visitorID: this.visitorID,
      productID,
      deviceType: this.deviceType,
      actionType: "basket",
      userID: this.userID,
      id: this.visitorID,
    });
    this.sendRequest(parameters, this.purchaseUrl, "POST");
    this.sendRequest(parameters, this.customerUrl, "POST");

    this.scoreMe();
  }

  purchased = async (products = [{ id: "no-id", quantity: 1, price: 1 }]) => {
    await this.ensureVisitorID();
    let basketID = new Date().getTime().toString();
    let parameters = JSON.stringify({
      type: this.type,
      visitorID: this.visitorID,
      products,
      basketID,
      actionType: "purchase",
      deviceType: this.deviceType,
      userID: this.userID,
      id: this.visitorID,
    });

    this.sendRequest(parameters, this.purchaseUrl, "POST");
    this.sendRequest(parameters, this.customerUrl, "POST");

    this.scoreMe();
  }

  async sendRequest(jsonObjectString, url, requestMethod) {
    try {

      if (url.includes('localhost') && Platform.OS === 'ios') {
        url = url.replace('localhost', '192.168.1.109');
      }
      
      const response = await fetch(url, {
        method: requestMethod,
        headers: {
          "Content-Type": "text/plain",
        },
        body: jsonObjectString,
      });

      if (response.ok) {
        const jsonResponse = await response.json();
        prettyJson = JSON.stringify(jsonResponse);
        return prettyJson;
      } else {
        // console.error("HTTPURLCONNECTION_ERROR", JSON.stringify(response));
        return "";
      }
    } catch (error) {
      // console.error("Request error:", error);
      return "";
    }
  }

  async scoreMe() {

    const lastScoreTime = storage.getString("enh_last_score_time");
    const lastScoreResponse = storage.getString("enh_last_score_response");
    const now = new Date().getTime();
    const threeDaysInMs = 3 * 24 * 60 * 60 * 1000;

    if (lastScoreTime && lastScoreResponse && (now - parseInt(lastScoreTime) < threeDaysInMs)) {
        this.pushResult(lastScoreResponse);
        return;
    }

    let parameters = JSON.stringify({
        type: this.type,
        visitorID: this.visitorID,
        userID: this.userID,
        id: this.visitorID,
        deviceOsVersion:
            Platform.OS === "android"
                ? Platform.Version.toString()
                : Platform.Version,
        deviceType: Platform.OS === "android" ? "a2" : "i2",
    });

    let url = this.customerUrl + this.visitorID;
    let requestMethod = "PUT";

    let response = await this.sendRequest(parameters, url, requestMethod);

    if (response) {
        storage.set("enh_last_score_time", now.toString());
        storage.set("enh_last_score_response", response);
    }

    this.pushResult(response);
  }

  pushResult(response) {
    let jsonObject = JSON.parse(response);

    this.pushToFacebook(jsonObject);
    this.pushToGoogle(jsonObject);
  }

  pushToFacebook = (response) => {
    // Audience
    if (response.audiences) {
      response.audiences.forEach(audience => {
        if (audience.adPlatform === "Facebook") {
          let params = {
            eventID: audience.eventId,
            name: audience.name
          };
          AppEventsLogger.logEvent(audience.name, params);
        }
      });
    }

    // Campaign
    if (response.campaigns) {
      response.campaigns.forEach(campaign => {
        if (campaign.adPlatform === "Facebook") {
          let params = {
            eventID: campaign.eventId,
            name: campaign.name
          };

          // add bundle params
          if (campaign.bundles && campaign.bundles.length > 0) {
            campaign.bundles.forEach(bundle => {
              params[bundle.name] = bundle.value;
            });
          }

          AppEventsLogger.logEvent(campaign.name, params);
        }
      });
    }
  }

  pushToGoogle = (response) => {
    // Audience
    if (response.audiences) {
      response.audiences.forEach(audience => {
        if (audience.adPlatform === "Google") {
          let name = audience.name.replace(/\s/g, '_').toLowerCase();
          analytics().logEvent(name, {value: 1});
        }
      });
    }

    // Campaign
    if (response.campaigns) {
      response.campaigns.forEach(campaign => {
        if (campaign.adPlatform === "Google") {
          let name = campaign.name.replace(/\s/g, '_').toLowerCase();
          let params = {};
          
          // add bundle params
          if (campaign.bundles && campaign.bundles.length > 0) {
            campaign.bundles.forEach(bundle => {
              params[bundle.name] = bundle.value;
            });
          }
          
          analytics().logEvent(name, params);
        }
      });
    }
  }

  ensureVisitorID = async () => {
    if (!this.visitorID) {
        await this.setVisitorID();
    }
  }

}

