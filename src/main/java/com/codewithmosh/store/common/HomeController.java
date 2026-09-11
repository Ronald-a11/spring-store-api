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

    @GetMapping("/checkout-cancel")
    public String checkoutCancel(Model model) {
        return index(model);
    }

    // Stripe sends the customer to /checkout-success after paying.
    @GetMapping({"/my-orders", "/checkout-success"})
    public String orders() {
        return "orders";
    }

    @GetMapping("/dashboard")
    public String dashboard() {
        return "dashboard";
    }
}
