import { Platform } from "react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppEventsLogger } from 'react-native-fbsdk-next';
import analytics from '@react-native-firebase/analytics';

export default class {
  constructor(token) {
    this.userID = token;
    this.visitorID;
    this.type = "ecommerce";
    this.deviceType = Platform.OS;
    this.domain = process.env.NODE_ENV === "production" ? "https://collect-app.enhencer.com/api/" : "http://localhost:4000/api/"
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
    this.visitorID = await AsyncStorage.getItem("enh_visitor_id");
    if (!this.visitorID) {
      this.visitorID = this.generateVisitorID();
      await AsyncStorage.setItem("enh_visitor_id", this.visitorID);
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


  listingPageView(category) {
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

  productPageView(productID, productCategory, productPrice) {
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

  addedToCart(productID) {
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

  purchased(products = [{ id: "no-id", quantity: 1, price: 1 }]) {
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
      const response = await fetch(url, {
        method: requestMethod,
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
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

    this.pushResult(response);

  }

  pushResult(response) {
    let jsonObject = JSON.parse(response);
    
    let audiences = jsonObject.audiences;
    audiences?.forEach((audience) => {
      this.pushToFacebook(audience);
      this.pushToGoogle(audience)
    })
  }

  pushToFacebook = (audience) => {
    let params = {
      eventID: audience.eventId,
      name: audience.name
    };
    AppEventsLogger.logEvent(audience.name, params);
  }

  pushToGoogle = (audience) => {
    let name = audience.name.replace(/\s/g, '_').toLowerCase();
    analytics().logEvent(name, {});
  }

}

