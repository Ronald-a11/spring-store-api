package com.codewithmosh.store.common;

import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;

@Controller
public class HomeController {
    @RequestMapping("/")
    public String index(Model model) {
        model.addAttribute("name", "Mosh");

        return "index";
    }

    // Fix beyond the course: Stripe sends the customer back to websiteUrl + "/checkout-success?orderId=<n>" or
    // "/checkout-cancel" (StripePaymentGateway), which the course never mapped, so a paying customer landed on a 401.
    // Both serve the storefront (same view and model as "/"); app.js reads the path and orderId and shows the banner.
    // GET only, permitted in SwaggerSecurityRules.
    @GetMapping({"/checkout-success", "/checkout-cancel"})
    public String checkoutReturn(Model model) {
        return index(model);
    }
}
