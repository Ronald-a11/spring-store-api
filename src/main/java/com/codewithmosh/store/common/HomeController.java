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

    // Stripe sends the customer back to one of these pages after checkout.
    @GetMapping({"/checkout-success", "/checkout-cancel"})
    public String checkoutReturn(Model model) {
        return index(model);
    }
}
